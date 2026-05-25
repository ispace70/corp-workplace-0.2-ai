"""SQL Agent: NL2SQL pipeline with DuckDB

프롬프트 : resources/prompts/sql_gen.md  sql_answer.md  sql_fix.md
Few-shot : resources/sql_fewshots.yml
코드맵   : DuckDB __comm_code_map 테이블 (런타임 조회)
"""
import asyncio
import json
import os
import re
from collections import defaultdict
from pathlib import Path
from typing import AsyncIterator, List, Optional

import duckdb
import yaml

from .llm_client import GCPChatLLM, stream_text_direct

DUCKDB_PATH   = os.getenv("DUCKDB_PATH", "")
_RESOURCES    = Path(__file__).parent.parent.parent / "resources"
_PROMPTS_DIR  = _RESOURCES / "prompts"
_FEWSHOTS_FILE = _RESOURCES / "sql_fewshots.yml"


# ---------------------------------------------------------------------------
# 파일 로더 (프롬프트 · Few-shot)
# ---------------------------------------------------------------------------

def _load_prompt(filename: str) -> str:
    """resources/prompts/{filename} 을 읽어 반환. 없으면 빈 문자열."""
    path = _PROMPTS_DIR / filename
    try:
        return path.read_text(encoding="utf-8")
    except FileNotFoundError:
        print(f"[WARN] 프롬프트 파일 없음: {path}")
        return ""


def _load_fewshots() -> List[dict]:
    """resources/sql_fewshots.yml 의 examples 목록 반환."""
    try:
        data = yaml.safe_load(_FEWSHOTS_FILE.read_text(encoding="utf-8"))
        return data.get("examples", []) if data else []
    except FileNotFoundError:
        return []
    except Exception as e:
        print(f"[WARN] few-shot 파일 파싱 오류: {e}")
        return []


def _match_fewshots(query: str, top_k: int = 3) -> str:
    """질문 키워드로 few-shot 예시를 매칭해 프롬프트 문자열 반환.

    tags 또는 question 텍스트에 쿼리 단어가 포함된 예시를 우선 반환.
    매칭 없으면 앞에서 top_k개 반환.
    """
    examples = _load_fewshots()
    if not examples:
        return ""

    query_words = set(re.findall(r"\w+", query))

    def _score(ex: dict) -> int:
        text = ex.get("question", "") + " " + " ".join(ex.get("tags", []))
        words = set(re.findall(r"\w+", text))
        return len(query_words & words)

    ranked = sorted(examples, key=_score, reverse=True)
    selected = ranked[:top_k]

    lines = []
    for i, ex in enumerate(selected, 1):
        sql = ex.get("sql", "").strip()
        lines.append(f"예시{i}) 질문: {ex['question']}\nSQL:\n```sql\n{sql}\n```")
    return "\n\n".join(lines)


# ---------------------------------------------------------------------------
# DuckDB helpers
# ---------------------------------------------------------------------------

def _get_schema() -> str:
    if not DUCKDB_PATH:
        return "DUCKDB_PATH 환경변수가 설정되지 않았습니다."
    try:
        conn = duckdb.connect(DUCKDB_PATH, read_only=True)
        tbl_comments = {
            r[0]: r[1]
            for r in conn.execute(
                "SELECT table_name, comment FROM duckdb_tables()"
            ).fetchall()
        }
        tables = conn.execute("SHOW TABLES").fetchall()
        if not tables:
            conn.close()
            return "테이블 없음"

        parts = []
        for (name,) in tables:
            if name.startswith("__"):       # 내부 메타 테이블 제외
                continue
            try:
                cols = conn.execute(
                    "SELECT column_name, data_type, comment "
                    "FROM duckdb_columns() WHERE table_name=? ORDER BY column_index",
                    [name],
                ).fetchall()
                col_defs = ", ".join(
                    f"{c[0]}({c[1]}{'|'+c[2] if c[2] else ''})"
                    for c in cols
                )
                tbl_label = name
                if tbl_comments.get(name):
                    tbl_label = f"{name} ({tbl_comments[name]})"
                parts.append(f"테이블: {tbl_label}\n컬럼: {col_defs}")
            except Exception:
                parts.append(f"테이블: {name} (스키마 조회 실패)")
        conn.close()
        return "\n\n".join(parts)
    except Exception as e:
        return f"DB 연결 실패: {e}"


def _get_codemap() -> str:
    """__comm_code_map → 테이블.컬럼별 코드값 컴팩트 문자열."""
    if not DUCKDB_PATH:
        return ""
    try:
        conn = duckdb.connect(DUCKDB_PATH, read_only=True)
        rows = conn.execute(
            "SELECT table_name, column_name, column_korea_name, "
            "       column_value, korea_term, synonyms "
            "FROM __comm_code_map "
            "ORDER BY table_name, column_name, column_value"
        ).fetchall()
        conn.close()
    except Exception:
        return ""

    if not rows:
        return ""

    groups: dict = defaultdict(list)
    for table, col, kor_col, val, term, syns in rows:
        key = (table or "", col or "", kor_col or "")
        label = term or ""
        if syns:
            label += f"/{syns}"
        groups[key].append(f"'{val}'={label}")

    lines = [
        f"{t}.{c}({k}): {', '.join(codes)}"
        for (t, c, k), codes in groups.items()
    ]
    return "\n".join(lines)


def _get_tables() -> List[dict]:
    if not DUCKDB_PATH:
        return [{"error": "DUCKDB_PATH 환경변수가 설정되지 않았습니다."}]
    try:
        conn = duckdb.connect(DUCKDB_PATH, read_only=True)
        tbl_comments = {
            r[0]: r[1] or ""
            for r in conn.execute("SELECT table_name, comment FROM duckdb_tables()").fetchall()
        }
        tables = conn.execute("SHOW TABLES").fetchall()
        result = []
        for (name,) in tables:
            if name.startswith("__"):
                continue
            try:
                cols = conn.execute(
                    "SELECT column_name, data_type, comment "
                    "FROM duckdb_columns() WHERE table_name=? ORDER BY column_index",
                    [name],
                ).fetchall()
                result.append({
                    "name": name,
                    "comment": tbl_comments.get(name, ""),
                    "columns": [{"name": c[0], "type": c[1], "comment": c[2] or ""} for c in cols],
                })
            except Exception:
                result.append({"name": name, "comment": "", "columns": []})
        conn.close()
        return result
    except Exception as e:
        return [{"error": str(e)}]


def _execute_sql(sql: str) -> dict:
    if not DUCKDB_PATH:
        return {"success": False, "error": "DUCKDB_PATH 환경변수가 설정되지 않았습니다."}
    try:
        conn = duckdb.connect(DUCKDB_PATH, read_only=True)
        cursor = conn.execute(sql)
        columns = [desc[0] for desc in cursor.description] if cursor.description else []
        rows = cursor.fetchall()
        conn.close()
        return {
            "success": True,
            "columns": columns,
            "rows": [list(r) for r in rows[:500]],
            "row_count": len(rows),
        }
    except Exception as e:
        return {"success": False, "error": str(e)}


def _extract_sql(text: str) -> str:
    match = re.search(r"```sql\s*([\s\S]+?)```", text, re.IGNORECASE)
    if match:
        return match.group(1).strip()
    return text.strip().strip("`").strip()


# ---------------------------------------------------------------------------
# SQL Agent
# ---------------------------------------------------------------------------

class SQLAgent:
    def __init__(self):
        self.llm = GCPChatLLM()
        self._schema_cache:  Optional[str] = None
        self._codemap_cache: Optional[str] = None

    def _cached_schema(self) -> str:
        if self._schema_cache is None:
            self._schema_cache = _get_schema()
        return self._schema_cache

    def _cached_codemap(self) -> str:
        if self._codemap_cache is None:
            self._codemap_cache = _get_codemap()
        return self._codemap_cache

    def _invoke(self, messages: list) -> str:
        return self.llm.invoke(messages).content

    async def astream(self, query: str) -> AsyncIterator[dict]:
        yield {"type": "route", "content": "sql"}
        yield {"type": "text", "content": "🗄️ 데이터베이스 스키마를 분석하고 있습니다...\n\n"}

        # 스키마·코드맵 병렬 조회 (캐시), few-shot은 파일 매칭
        schema, codemap = await asyncio.gather(
            asyncio.to_thread(self._cached_schema),
            asyncio.to_thread(self._cached_codemap),
        )
        fewshots = _match_fewshots(query)

        codemap_section  = f"\n## 코드맵 (코드값 의미)\n{codemap}\n" if codemap else ""
        fewshot_section  = f"\n## 유사 예시\n{fewshots}\n"          if fewshots else ""

        yield {"type": "text", "content": "✍️ SQL 쿼리를 생성하고 있습니다...\n\n"}

        from langchain_core.messages import HumanMessage
        prompt = _load_prompt("sql_gen.md").format(
            schema=schema,
            codemap_section=codemap_section,
            fewshot_section=fewshot_section,
            query=query,
        )
        sql_text = await asyncio.to_thread(self._invoke, [HumanMessage(content=prompt)])
        sql = _extract_sql(sql_text)

        yield {"type": "sql_review", "content": sql}
        yield {"type": "text", "content": "위 SQL을 확인하고 **실행** 버튼을 클릭하거나 수정 후 실행하세요.\n\n"}

    async def astream_execute(self, query: str, sql: str) -> AsyncIterator[dict]:
        yield {"type": "text", "content": "⚡ SQL을 실행하고 있습니다...\n\n"}

        schema, codemap = await asyncio.gather(
            asyncio.to_thread(self._cached_schema),
            asyncio.to_thread(self._cached_codemap),
        )
        codemap_section = f"\n## 코드맵\n{codemap}\n" if codemap else ""

        current_sql = sql
        result = None
        error = ""

        for _ in range(3):
            res = _execute_sql(current_sql)
            if res["success"]:
                result = res
                break
            error = res["error"]
            yield {"type": "text", "content": f"⚠️ SQL 오류가 발생했습니다. 수정 중...\n```\n{error}\n```\n\n"}

            from langchain_core.messages import HumanMessage
            fix_prompt = _load_prompt("sql_fix.md").format(
                sql=current_sql,
                error=error,
                schema=schema,
                codemap_section=codemap_section,
            )
            fixed = await asyncio.to_thread(self._invoke, [HumanMessage(content=fix_prompt)])
            current_sql = _extract_sql(fixed)
            yield {"type": "sql_review", "content": current_sql}

        if result is None:
            yield {"type": "text", "content": f"❌ SQL 실행에 실패했습니다: {error}\n"}
            return

        yield {"type": "sql_result", "content": result}
        yield {"type": "text", "content": f"✅ **{result['row_count']}개** 행이 조회되었습니다.\n\n---\n\n"}

        result_preview = {
            "columns": result["columns"],
            "rows": result["rows"][:10],
            "row_count": result["row_count"],
        }
        answer_prompt = _load_prompt("sql_answer.md").format(
            query=query,
            sql=current_sql,
            result=json.dumps(result_preview, ensure_ascii=False, indent=2),
        )
        async for chunk in stream_text_direct(answer_prompt):
            yield {"type": "text", "content": chunk}


# ---------------------------------------------------------------------------
# Singleton helpers
# ---------------------------------------------------------------------------

_sql_agent: Optional[SQLAgent] = None


def get_sql_agent() -> SQLAgent:
    global _sql_agent
    if _sql_agent is None:
        _sql_agent = SQLAgent()
    return _sql_agent


def get_tables() -> List[dict]:
    return _get_tables()


def execute_raw_sql(sql: str) -> dict:
    return _execute_sql(sql)
