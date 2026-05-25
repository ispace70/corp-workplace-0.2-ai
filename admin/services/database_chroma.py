"""ChromaDB 관리 — Few-Shot 예시 컬렉션 (./resources/chroma/database/)"""
import os
from typing import List, Dict, Optional

import chromadb
from dotenv import load_dotenv

load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), "../../.env"))

_CHROMA_PATH = os.getenv(
    "CHROMA_PATH_DATABASE",
    os.path.join(os.path.dirname(__file__), "../../resources/chroma/database"),
)
COLLECTION_NAME = "fewshot_examples"

_client: Optional[chromadb.ClientAPI] = None
_embed_fn = None


def _get_embed_fn():
    global _embed_fn
    if _embed_fn is None:
        from .embeddings import build_embeddings
        _embed_fn, _ = build_embeddings()
    return _embed_fn


def get_client() -> chromadb.ClientAPI:
    global _client
    if _client is None:
        os.makedirs(_CHROMA_PATH, exist_ok=True)
        _client = chromadb.PersistentClient(path=_CHROMA_PATH)
    return _client


def get_collection() -> chromadb.Collection:
    return get_client().get_or_create_collection(
        name=COLLECTION_NAME,
        metadata={"hnsw:space": "cosine"},
    )


def index_fewshot(fewshot_id: str, question: str, sql: str) -> None:
    """질문 텍스트를 임베딩, SQL은 메타데이터로 저장."""
    col = get_collection()
    embed_fn = _get_embed_fn()
    vec = embed_fn([question])[0]
    col.upsert(
        ids=[fewshot_id],
        embeddings=[vec],
        documents=[question],
        metadatas=[{"fewshot_id": fewshot_id, "question": question, "sql": sql}],
    )


def update_fewshot(fewshot_id: str, question: str, sql: str) -> None:
    delete_fewshot(fewshot_id)
    index_fewshot(fewshot_id, question, sql)


def delete_fewshot(fewshot_id: str) -> None:
    col = get_collection()
    try:
        col.delete(ids=[fewshot_id])
    except Exception:
        pass


def search_fewshots(query: str, top_k: int = 5) -> List[Dict]:
    col = get_collection()
    count = col.count()
    if count == 0:
        return []
    embed_fn = _get_embed_fn()
    vec = embed_fn([query])[0]
    res = col.query(query_embeddings=[vec], n_results=min(top_k, count))
    results = []
    metas = res.get("metadatas", [[]])[0]
    dists = res.get("distances", [[]])[0]
    for meta, dist in zip(metas, dists):
        results.append({
            "question": meta.get("question", ""),
            "sql": meta.get("sql", ""),
            "score": round(1 - dist, 4),
        })
    return results


def rebuild_all(fewshots: List[Dict]) -> None:
    """전체 few-shot 재구축 (id, question, sql 포함 리스트)."""
    client = get_client()
    try:
        client.delete_collection(COLLECTION_NAME)
    except Exception:
        pass
    embed_fn = _get_embed_fn()
    col = get_collection()
    if not fewshots:
        return
    ids   = [f["id"] for f in fewshots]
    texts = [f["question"] for f in fewshots]
    metas = [{"fewshot_id": f["id"], "question": f["question"], "sql": f["sql"]} for f in fewshots]
    batch = 50
    for i in range(0, len(ids), batch):
        b_ids   = ids[i : i + batch]
        b_texts = texts[i : i + batch]
        b_metas = metas[i : i + batch]
        b_embs  = embed_fn(b_texts)
        col.upsert(ids=b_ids, embeddings=b_embs, documents=b_texts, metadatas=b_metas)
