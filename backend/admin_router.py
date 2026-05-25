"""Admin API Router — 지식검색 및 SQL 관리 엔드포인트"""
import os
import sys
import uuid
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List

import yaml

from fastapi import APIRouter, HTTPException, UploadFile, File, BackgroundTasks
from pydantic import BaseModel

# admin/services 경로 추가
_PROJECT_ROOT = os.path.join(os.path.dirname(__file__), "..")
sys.path.insert(0, _PROJECT_ROOT)

from admin.services import meta_store, knowledge_chroma
from admin.services.doc_loader import load_document
from admin.services.url_crawler import crawl_site, url_to_filename

meta_store.init_db()

admin_router = APIRouter(prefix="/admin", tags=["admin"])

# ── 파일 경로 상수 ──────────────────────────────────────────────────────────
_RESOURCES    = Path(_PROJECT_ROOT) / "resources"
_PROMPTS_DIR  = _RESOURCES / "prompts"
_FEWSHOTS_FILE = _RESOURCES / "sql_fewshots.yml"

_PROMPT_FILES = {
    "sql_gen":    "sql_gen.md",
    "sql_answer": "sql_answer.md",
    "sql_fix":    "sql_fix.md",
}


# ── YAML 파일 헬퍼 ──────────────────────────────────────────────────────────

def _read_fewshots() -> List[dict]:
    try:
        data = yaml.safe_load(_FEWSHOTS_FILE.read_text(encoding="utf-8"))
        return data.get("examples", []) if data else []
    except FileNotFoundError:
        return []


def _write_fewshots(examples: List[dict]) -> None:
    _FEWSHOTS_FILE.write_text(
        yaml.dump({"examples": examples}, allow_unicode=True,
                  default_flow_style=False, sort_keys=False),
        encoding="utf-8",
    )

_UPLOAD_DIR = os.getenv(
    "ADMIN_UPLOAD_DIR",
    str(Path(_PROJECT_ROOT) / "admin" / "uploads"),
)
os.makedirs(_UPLOAD_DIR, exist_ok=True)


# ── 통계 ──────────────────────────────────────────────────────────────────

@admin_router.get("/stats")
def get_stats():
    try:
        k_stats = knowledge_chroma.get_stats()
    except Exception:
        k_stats = {"total_chunks": 0, "doc_count": 0}
    docs = meta_store.list_documents()
    return {
        "knowledge_chunks": k_stats["total_chunks"],
        "doc_count": len(docs),
        "indexed_count": sum(1 for d in docs if d["status"] == "indexed"),
    }


# ── 문서 관리 ──────────────────────────────────────────────────────────────

@admin_router.get("/docs")
def list_docs():
    return meta_store.list_documents()


@admin_router.post("/docs/upload")
async def upload_doc(background_tasks: BackgroundTasks, file: UploadFile = File(...)):
    ext = Path(file.filename or "file").suffix.lower()
    uid = str(uuid.uuid4())
    save_path = os.path.join(_UPLOAD_DIR, f"{uid}{ext}")

    content = await file.read()
    with open(save_path, "wb") as fp:
        fp.write(content)

    doc = meta_store.create_document(file.filename or uid, ext.lstrip("."), save_path)

    def _ingest(did=doc["id"], path=save_path, fname=file.filename or uid):
        cs = int(meta_store.get_setting("chunk_size", "500"))
        co = int(meta_store.get_setting("chunk_overlap", "50"))
        try:
            pages = load_document(path)
            count = knowledge_chroma.index_document(did, fname, pages, cs, co)
            meta_store.update_document_status(did, "indexed", count)
        except Exception as e:
            meta_store.update_document_status(did, "error")
            print(f"[ERROR] 인덱싱 실패 ({fname}): {e}")

    background_tasks.add_task(_ingest)
    return doc


class SiteRequest(BaseModel):
    url: str
    max_pages: int = 50  # 최대 크롤링 페이지 수


@admin_router.post("/docs/site")
def add_site(body: SiteRequest, background_tasks: BackgroundTasks):
    fname = url_to_filename(body.url)
    doc = meta_store.create_document(fname, "url", body.url)

    def _ingest_site(did=doc["id"], url=body.url, fn=fname, max_pages=body.max_pages):
        cs = int(meta_store.get_setting("chunk_size", "500"))
        co = int(meta_store.get_setting("chunk_overlap", "50"))
        try:
            crawled = crawl_site(url, max_pages=max_pages)
            if not crawled:
                raise ValueError("크롤링된 페이지가 없습니다 (접근이 차단되었거나 텍스트가 없는 사이트입니다).")

            # 각 페이지를 별도 page로 묶어 한 doc_id 아래 인덱싱
            pages = [
                {"text": f"URL: {p['url']}\n제목: {p['title']}\n\n{p['text']}", "page": i + 1}
                for i, p in enumerate(crawled)
            ]
            count = knowledge_chroma.index_document(did, fn, pages, cs, co)
            if count == 0:
                raise ValueError("청킹 후 저장된 내용이 없습니다.")

            crawled_urls = "\n".join(f"  [{i+1}] {p['url']}" for i, p in enumerate(crawled))
            print(f"[crawl] {fn}: {len(crawled)}페이지, {count}청크 인덱싱 완료\n{crawled_urls}")
            meta_store.update_document_status(did, "indexed", count)
        except Exception as e:
            meta_store.update_document_status(did, "error")
            print(f"[ERROR] 사이트 인덱싱 실패 ({url}): {e}")

    background_tasks.add_task(_ingest_site)
    return doc


@admin_router.delete("/docs/{doc_id}")
def delete_doc(doc_id: str):
    doc = meta_store.get_document(doc_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    knowledge_chroma.delete_document(doc_id)
    meta_store.delete_document(doc_id)
    fp = doc.get("file_path", "")
    if fp and doc.get("file_type") != "url" and os.path.exists(fp):
        os.remove(fp)
    return {"ok": True}


@admin_router.post("/docs/{doc_id}/reindex")
def reindex_doc(doc_id: str, background_tasks: BackgroundTasks):
    doc = meta_store.get_document(doc_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    meta_store.update_document_status(doc_id, "pending")

    def _reindex():
        cs = int(meta_store.get_setting("chunk_size", "500"))
        co = int(meta_store.get_setting("chunk_overlap", "50"))
        try:
            knowledge_chroma.delete_document(doc_id)
            if doc["file_type"] == "url":
                crawled = crawl_site(doc["file_path"])
                if not crawled:
                    raise ValueError("크롤링된 페이지가 없습니다.")
                pages = [
                    {"text": f"URL: {p['url']}\n제목: {p['title']}\n\n{p['text']}", "page": i + 1}
                    for i, p in enumerate(crawled)
                ]
            else:
                pages = load_document(doc["file_path"])
            count = knowledge_chroma.index_document(doc_id, doc["filename"], pages, cs, co)
            meta_store.update_document_status(doc_id, "indexed", count)
        except Exception as e:
            meta_store.update_document_status(doc_id, "error")
            print(f"[ERROR] 재인덱싱 실패: {e}")

    background_tasks.add_task(_reindex)
    return {"ok": True, "status": "pending"}


# ── 설정 ──────────────────────────────────────────────────────────────────

@admin_router.get("/settings")
def get_settings():
    return meta_store.get_all_settings()


class SettingsUpdate(BaseModel):
    data: Dict[str, str]


@admin_router.put("/settings")
def update_settings(body: SettingsUpdate):
    for k, v in body.data.items():
        meta_store.update_setting(k, v)
    return {"ok": True}


@admin_router.get("/settings/defaults")
def get_defaults():
    return {k: meta_store.get_default_prompt(k) for k in [
        "sql_intent_prompt", "sql_gen_prompt", "sql_answer_prompt", "sql_fix_prompt"
    ]}


# ── 프롬프트 파일 관리 ────────────────────────────────────────────────────────

@admin_router.get("/prompts")
def get_prompts():
    result = {}
    for key, filename in _PROMPT_FILES.items():
        path = _PROMPTS_DIR / filename
        try:
            result[key] = path.read_text(encoding="utf-8")
        except FileNotFoundError:
            result[key] = ""
    return result


class PromptUpdate(BaseModel):
    content: str


@admin_router.put("/prompts/{key}")
def update_prompt(key: str, body: PromptUpdate):
    if key not in _PROMPT_FILES:
        raise HTTPException(status_code=404, detail=f"Unknown prompt key: {key}")
    path = _PROMPTS_DIR / _PROMPT_FILES[key]
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(body.content, encoding="utf-8")
    return {"ok": True}


# ── 벡터 갱신 ─────────────────────────────────────────────────────────────

@admin_router.post("/vector/refresh")
def vector_refresh(background_tasks: BackgroundTasks):
    docs = meta_store.list_documents()

    def _rebuild():
        cs = int(meta_store.get_setting("chunk_size", "500"))
        co = int(meta_store.get_setting("chunk_overlap", "50"))
        knowledge_chroma.delete_all()
        for doc in docs:
            meta_store.update_document_status(doc["id"], "pending")
            try:
                if doc["file_type"] == "url":
                    crawled = crawl_site(doc["file_path"])
                    if not crawled:
                        raise ValueError("크롤링된 페이지가 없습니다.")
                    pages = [
                        {"text": f"URL: {p['url']}\n제목: {p['title']}\n\n{p['text']}", "page": i + 1}
                        for i, p in enumerate(crawled)
                    ]
                else:
                    if not os.path.exists(doc["file_path"]):
                        meta_store.update_document_status(doc["id"], "error")
                        continue
                    pages = load_document(doc["file_path"])
                count = knowledge_chroma.index_document(doc["id"], doc["filename"], pages, cs, co)
                meta_store.update_document_status(doc["id"], "indexed", count)
            except Exception as e:
                meta_store.update_document_status(doc["id"], "error")
                print(f"[ERROR] 재구축 실패: {e}")

    background_tasks.add_task(_rebuild)
    return {"ok": True, "total": len(docs)}


@admin_router.post("/vector/migrate")
class MigrateRequest(BaseModel):
    legacy_path: str


@admin_router.post("/vector/migrate")
def vector_migrate(body: MigrateRequest):
    try:
        count = knowledge_chroma.migrate_from_legacy(body.legacy_path)
        return {"ok": True, "migrated": count}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ── Few-Shot 예시 (파일 기반: resources/sql_fewshots.yml) ──────────────────

@admin_router.get("/fewshots")
def list_fewshots():
    examples = _read_fewshots()
    return [
        {
            "id":         ex.get("id", ""),
            "question":   ex.get("question", ""),
            "sql":        ex.get("sql", "").strip(),
            "tags":       ex.get("tags", []),
            "created_at": ex.get("created_at", ""),
            "updated_at": ex.get("updated_at", ""),
        }
        for ex in examples
    ]


class FewshotCreate(BaseModel):
    question: str
    sql: str
    tags: List[str] = []


@admin_router.post("/fewshots")
def create_fewshot(body: FewshotCreate):
    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    new_id = str(uuid.uuid4())
    entry = {
        "id":         new_id,
        "question":   body.question,
        "sql":        body.sql,
        "tags":       body.tags,
        "created_at": now,
        "updated_at": now,
    }
    examples = _read_fewshots()
    examples.append(entry)
    _write_fewshots(examples)
    return entry


class FewshotUpdate(BaseModel):
    question: str
    sql: str
    tags: List[str] = []


@admin_router.put("/fewshots/{fewshot_id}")
def update_fewshot(fewshot_id: str, body: FewshotUpdate):
    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    examples = _read_fewshots()
    for ex in examples:
        if ex.get("id") == fewshot_id:
            ex["question"]   = body.question
            ex["sql"]        = body.sql
            ex["tags"]       = body.tags
            ex["updated_at"] = now
            break
    else:
        raise HTTPException(status_code=404, detail="not found")
    _write_fewshots(examples)
    return {"ok": True}


@admin_router.delete("/fewshots/{fewshot_id}")
def delete_fewshot(fewshot_id: str):
    examples = _read_fewshots()
    new_list = [ex for ex in examples if ex.get("id") != fewshot_id]
    if len(new_list) == len(examples):
        raise HTTPException(status_code=404, detail="not found")
    _write_fewshots(new_list)
    return {"ok": True}


# ── 코드맵 ────────────────────────────────────────────────────────────────

@admin_router.get("/codemap")
def list_codemap():
    """ispace.db __comm_code_map 테이블 전체 반환 (SQL 에이전트가 실제 사용)."""
    import duckdb
    db_path = os.getenv("DUCKDB_PATH", "")
    if not db_path:
        return []
    try:
        con = duckdb.connect(db_path, read_only=True)
        rows = con.execute(
            "SELECT table_name, column_name, column_korea_name, "
            "       column_value, korea_term, description, synonyms "
            "FROM __comm_code_map "
            "ORDER BY table_name, column_name, column_value"
        ).fetchall()
        con.close()
        return [
            {
                "table_name":       r[0] or "",
                "column_name":      r[1] or "",
                "column_korea_name": r[2] or "",
                "column_value":     r[3] or "",
                "korea_term":       r[4] or "",
                "description":      r[5] or "",
                "synonyms":         r[6] or "",
            }
            for r in rows
        ]
    except Exception as e:
        return [{"error": str(e)}]


@admin_router.get("/codemap/prompt")
def get_codemap_prompt():
    """SQL 에이전트가 프롬프트에 실제 주입하는 코드맵 문자열 반환."""
    import duckdb
    from collections import defaultdict
    db_path = os.getenv("DUCKDB_PATH", "")
    if not db_path:
        return {"text": ""}
    try:
        con = duckdb.connect(db_path, read_only=True)
        rows = con.execute(
            "SELECT table_name, column_name, column_korea_name, "
            "       column_value, korea_term, synonyms "
            "FROM __comm_code_map "
            "ORDER BY table_name, column_name, column_value"
        ).fetchall()
        con.close()
    except Exception as e:
        return {"text": f"오류: {e}"}

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
    return {"text": "\n".join(lines)}


# ── DB 스키마 ──────────────────────────────────────────────────────────────

@admin_router.get("/schema")
def get_schema():
    import duckdb
    db_path = os.getenv("DUCKDB_PATH", "")
    if not db_path:
        return {"error": "DUCKDB_PATH 환경변수가 설정되지 않았습니다."}
    try:
        con = duckdb.connect(db_path, read_only=True)
        tbl_comments = {
            r[0]: r[1] or ""
            for r in con.execute("SELECT table_name, comment FROM duckdb_tables()").fetchall()
        }
        tables = con.execute("SHOW TABLES").fetchall()
        schema: Dict[str, Any] = {}
        for (tbl,) in tables:
            if tbl.startswith("__"):
                continue
            try:
                cols = con.execute(
                    "SELECT column_name, data_type, comment "
                    "FROM duckdb_columns() WHERE table_name=? ORDER BY column_index",
                    [tbl],
                ).fetchall()
                schema[tbl] = {
                    "comment": tbl_comments.get(tbl, ""),
                    "columns": [{"column": c[0], "type": c[1], "comment": c[2] or ""} for c in cols],
                }
            except Exception:
                schema[tbl] = {"comment": "", "columns": []}
        con.close()
        return schema
    except Exception as e:
        return {"error": str(e)}
