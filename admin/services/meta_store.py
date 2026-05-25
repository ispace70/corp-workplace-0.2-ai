"""어드민 메타데이터 저장소 — DuckDB 기반"""
import os
import threading
import uuid
from datetime import datetime
from typing import List, Optional, Dict, Any

import duckdb
from dotenv import load_dotenv

load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), "../../.env"))

_DB_PATH = os.getenv(
    "ADMIN_META_DB",
    os.path.join(os.path.dirname(__file__), "../../resources/admin_meta.duckdb"),
)

# sql_agent.py 기본 프롬프트 (복원용)
_DEFAULT_PROMPTS = {
    "sql_intent_prompt": """당신은 데이터 분석 전문가입니다. 사용자의 질문을 분석하여 필요한 정보를 파악하세요.

다음을 출력하세요:
1. 질문의 의도 (한 줄 요약)
2. 필요한 테이블 목록
3. 필요한 컬럼 및 조건

간결하게 답변하세요.""",
    "sql_gen_prompt": """당신은 DuckDB SQL 전문가입니다. 아래 스키마와 사용자 의도를 바탕으로 정확한 DuckDB SQL 쿼리를 생성하세요.

규칙:
- DuckDB 문법 사용 (LIMIT, WITH, window functions 지원)
- 한국어 컬럼명/값이 있을 수 있음
- 결과는 반드시 SQL 쿼리만 출력 (설명 없이)
- 쿼리는 ```sql ... ``` 블록으로 감싸세요

스키마:
{schema}

사용자 의도:
{intent}

원본 질문: {query}""",
    "sql_answer_prompt": """당신은 데이터 분석 결과를 쉽게 설명하는 전문가입니다.

아래 SQL 실행 결과를 바탕으로 사용자의 질문에 한국어로 답변하세요.
숫자는 적절히 포맷하고, 인사이트가 있으면 함께 제공하세요.

원본 질문: {query}
실행된 SQL: {sql}
결과:
{result}
""",
    "sql_fix_prompt": """아래 SQL에서 오류가 발생했습니다. 오류를 수정하여 올바른 SQL을 다시 작성하세요.
결과는 SQL 쿼리만 출력하세요 (```sql ... ``` 블록).

원본 SQL:
{sql}

오류 메시지:
{error}

스키마:
{schema}""",
    "chunk_size": "500",
    "chunk_overlap": "50",
}

_lock = threading.Lock()


def _conn() -> duckdb.DuckDBPyConnection:
    return duckdb.connect(_DB_PATH)


def init_db() -> None:
    os.makedirs(os.path.dirname(os.path.abspath(_DB_PATH)), exist_ok=True)
    with _lock:
        con = _conn()
        con.execute("""
            CREATE TABLE IF NOT EXISTS knowledge_docs (
                id          VARCHAR PRIMARY KEY,
                filename    VARCHAR NOT NULL,
                file_type   VARCHAR DEFAULT '',
                file_path   VARCHAR NOT NULL,
                status      VARCHAR DEFAULT 'pending',
                chunk_count INTEGER DEFAULT 0,
                created_at  VARCHAR DEFAULT ''
            )
        """)
        con.execute("""
            CREATE TABLE IF NOT EXISTS sql_fewshots (
                id          VARCHAR PRIMARY KEY,
                question    VARCHAR NOT NULL,
                sql         VARCHAR NOT NULL,
                created_at  VARCHAR DEFAULT '',
                updated_at  VARCHAR DEFAULT ''
            )
        """)
        con.execute("""
            CREATE TABLE IF NOT EXISTS settings (
                key   VARCHAR PRIMARY KEY,
                value VARCHAR DEFAULT ''
            )
        """)
        con.execute("""
            CREATE TABLE IF NOT EXISTS code_aliases (
                group_cd    VARCHAR PRIMARY KEY,
                alias_name  VARCHAR NOT NULL,
                updated_at  VARCHAR DEFAULT ''
            )
        """)
        # 기본 설정값 삽입 (없을 때만)
        for k, v in _DEFAULT_PROMPTS.items():
            con.execute(
                "INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)",
                [k, v],
            )
        con.commit()
        con.close()


# ── knowledge_docs ─────────────────────────────────────────────────────────

def list_documents() -> List[Dict[str, Any]]:
    with _lock:
        con = _conn()
        rows = con.execute(
            "SELECT id, filename, file_type, file_path, status, chunk_count, created_at "
            "FROM knowledge_docs ORDER BY created_at DESC"
        ).fetchall()
        con.close()
    return [
        dict(zip(["id", "filename", "file_type", "file_path", "status", "chunk_count", "created_at"], r))
        for r in rows
    ]


def create_document(filename: str, file_type: str, file_path: str) -> Dict[str, Any]:
    doc_id = str(uuid.uuid4())
    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    with _lock:
        con = _conn()
        con.execute(
            "INSERT INTO knowledge_docs (id, filename, file_type, file_path, status, chunk_count, created_at) "
            "VALUES (?, ?, ?, ?, 'pending', 0, ?)",
            [doc_id, filename, file_type, file_path, now],
        )
        con.commit()
        con.close()
    return {"id": doc_id, "filename": filename, "file_type": file_type,
            "file_path": file_path, "status": "pending", "chunk_count": 0, "created_at": now}


def update_document_status(doc_id: str, status: str, chunk_count: int = 0) -> None:
    with _lock:
        con = _conn()
        con.execute(
            "UPDATE knowledge_docs SET status=?, chunk_count=? WHERE id=?",
            [status, chunk_count, doc_id],
        )
        con.commit()
        con.close()


def get_document(doc_id: str) -> Optional[Dict[str, Any]]:
    with _lock:
        con = _conn()
        row = con.execute(
            "SELECT id, filename, file_type, file_path, status, chunk_count, created_at "
            "FROM knowledge_docs WHERE id=?",
            [doc_id],
        ).fetchone()
        con.close()
    if row is None:
        return None
    return dict(zip(["id", "filename", "file_type", "file_path", "status", "chunk_count", "created_at"], row))


def delete_document(doc_id: str) -> Optional[Dict[str, Any]]:
    doc = get_document(doc_id)
    if doc is None:
        return None
    with _lock:
        con = _conn()
        con.execute("DELETE FROM knowledge_docs WHERE id=?", [doc_id])
        con.commit()
        con.close()
    return doc


# ── sql_fewshots ───────────────────────────────────────────────────────────

def list_fewshots() -> List[Dict[str, Any]]:
    with _lock:
        con = _conn()
        rows = con.execute(
            "SELECT id, question, sql, created_at, updated_at FROM sql_fewshots ORDER BY created_at"
        ).fetchall()
        con.close()
    return [dict(zip(["id", "question", "sql", "created_at", "updated_at"], r)) for r in rows]


def create_fewshot(question: str, sql: str) -> Dict[str, Any]:
    fid = str(uuid.uuid4())
    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    with _lock:
        con = _conn()
        con.execute(
            "INSERT INTO sql_fewshots (id, question, sql, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
            [fid, question, sql, now, now],
        )
        con.commit()
        con.close()
    return {"id": fid, "question": question, "sql": sql, "created_at": now, "updated_at": now}


def update_fewshot(fewshot_id: str, question: str, sql: str) -> None:
    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    with _lock:
        con = _conn()
        con.execute(
            "UPDATE sql_fewshots SET question=?, sql=?, updated_at=? WHERE id=?",
            [question, sql, now, fewshot_id],
        )
        con.commit()
        con.close()


def delete_fewshot(fewshot_id: str) -> None:
    with _lock:
        con = _conn()
        con.execute("DELETE FROM sql_fewshots WHERE id=?", [fewshot_id])
        con.commit()
        con.close()


# ── settings ───────────────────────────────────────────────────────────────

def get_setting(key: str, default: str = "") -> str:
    with _lock:
        con = _conn()
        row = con.execute("SELECT value FROM settings WHERE key=?", [key]).fetchone()
        con.close()
    return row[0] if row else default


def update_setting(key: str, value: str) -> None:
    with _lock:
        con = _conn()
        con.execute(
            "INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)",
            [key, value],
        )
        con.commit()
        con.close()


def get_all_settings() -> Dict[str, str]:
    with _lock:
        con = _conn()
        rows = con.execute("SELECT key, value FROM settings").fetchall()
        con.close()
    return {r[0]: r[1] for r in rows}


def get_default_prompt(key: str) -> str:
    return _DEFAULT_PROMPTS.get(key, "")


# ── code_aliases ───────────────────────────────────────────────────────────

def list_code_aliases() -> List[Dict[str, Any]]:
    with _lock:
        con = _conn()
        rows = con.execute(
            "SELECT group_cd, alias_name, updated_at FROM code_aliases ORDER BY group_cd"
        ).fetchall()
        con.close()
    return [dict(zip(["group_cd", "alias_name", "updated_at"], r)) for r in rows]


def upsert_code_alias(group_cd: str, alias_name: str) -> None:
    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    with _lock:
        con = _conn()
        con.execute(
            "INSERT OR REPLACE INTO code_aliases (group_cd, alias_name, updated_at) VALUES (?, ?, ?)",
            [group_cd, alias_name, now],
        )
        con.commit()
        con.close()


def delete_code_alias(group_cd: str) -> None:
    with _lock:
        con = _conn()
        con.execute("DELETE FROM code_aliases WHERE group_cd=?", [group_cd])
        con.commit()
        con.close()
