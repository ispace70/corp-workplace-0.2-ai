"""ChromaDB 관리 — 지식검색 컬렉션 (./resources/chroma/knowledge/)"""
import os
import re
from typing import List, Dict, Any, Optional

import chromadb
from dotenv import load_dotenv

load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), "../../.env"))

_CHROMA_PATH = os.getenv(
    "CHROMA_PATH_KNOWLEDGE",
    os.path.join(os.path.dirname(__file__), "../../resources/chroma/knowledge"),
)
COLLECTION_NAME = "knowledge"

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


def get_stats() -> Dict[str, Any]:
    col = get_collection()
    count = col.count()
    # 고유 doc_id 목록 추출
    if count > 0:
        res = col.get(include=["metadatas"], limit=count)
        doc_ids = list({m.get("doc_id", "") for m in (res["metadatas"] or [])})
    else:
        doc_ids = []
    return {"total_chunks": count, "doc_count": len(doc_ids), "doc_ids": doc_ids}


def _chunk_text(text: str, chunk_size: int, chunk_overlap: int) -> List[str]:
    """슬라이딩 윈도우 청킹."""
    if not text.strip():
        return []
    # 단락 기준 분할 후 합치기
    paragraphs = re.split(r'\n\n+', text)
    chunks: List[str] = []
    current = ""
    for para in paragraphs:
        if len(current) + len(para) + 2 <= chunk_size:
            current = (current + "\n\n" + para).strip()
        else:
            if current:
                chunks.append(current)
            # 단락 자체가 chunk_size보다 크면 강제 분할
            while len(para) > chunk_size:
                chunks.append(para[:chunk_size])
                para = para[max(0, chunk_size - chunk_overlap):]
            current = para
    if current:
        chunks.append(current)
    # overlap 적용: 이전 청크 끝부분을 다음 청크에 prepend
    if chunk_overlap > 0 and len(chunks) > 1:
        overlapped = [chunks[0]]
        for i in range(1, len(chunks)):
            prefix = chunks[i - 1][-chunk_overlap:]
            overlapped.append((prefix + " " + chunks[i]).strip())
        return overlapped
    return chunks


def index_document(
    doc_id: str,
    filename: str,
    pages: List[Dict],
    chunk_size: int = 500,
    chunk_overlap: int = 50,
) -> int:
    """문서를 청킹·임베딩하여 ChromaDB에 저장. 반환: 총 청크 수."""
    col = get_collection()
    embed_fn = _get_embed_fn()

    all_texts: List[str] = []
    all_metas: List[Dict] = []
    all_ids: List[str] = []

    chunk_idx = 0
    for page in pages:
        text = page.get("text", "")
        page_num = page.get("page", 1)
        chunks = _chunk_text(text, chunk_size, chunk_overlap)
        for chunk in chunks:
            if len(chunk.strip()) < 30:
                continue
            cid = f"{doc_id}_p{page_num}_c{chunk_idx}"
            all_ids.append(cid)
            all_texts.append(chunk)
            all_metas.append({
                "doc_id": doc_id,
                "filename": filename,
                "page": str(page_num),
                "chunk_idx": str(chunk_idx),
                "source": filename,
            })
            chunk_idx += 1

    if not all_texts:
        return 0

    # 배치 임베딩
    batch = 50
    for i in range(0, len(all_texts), batch):
        b_texts = all_texts[i : i + batch]
        b_ids   = all_ids[i : i + batch]
        b_metas = all_metas[i : i + batch]
        embeddings = embed_fn(b_texts)
        col.upsert(ids=b_ids, embeddings=embeddings, documents=b_texts, metadatas=b_metas)

    return chunk_idx


def delete_document(doc_id: str) -> None:
    col = get_collection()
    col.delete(where={"doc_id": doc_id})


def delete_all() -> None:
    client = get_client()
    try:
        client.delete_collection(COLLECTION_NAME)
    except Exception:
        pass


def search(query: str, top_k: int = 5) -> List[Dict]:
    col = get_collection()
    embed_fn = _get_embed_fn()
    vec = embed_fn([query])[0]
    res = col.query(query_embeddings=[vec], n_results=min(top_k, max(1, col.count())))
    results = []
    docs = res.get("documents", [[]])[0]
    metas = res.get("metadatas", [[]])[0]
    dists = res.get("distances", [[]])[0]
    for doc, meta, dist in zip(docs, metas, dists):
        results.append({"content": doc, "metadata": meta, "score": round(1 - dist, 4)})
    return results


def migrate_from_legacy(legacy_path: str) -> int:
    """레거시 ChromaDB(resources/)에서 청크를 복사."""
    import chromadb as _chromadb
    legacy_client = _chromadb.PersistentClient(path=legacy_path)
    cols = legacy_client.list_collections()
    if not cols:
        return 0
    best = max(cols, key=lambda c: c.count())
    legacy_col = legacy_client.get_collection(best.name)

    total = legacy_col.count()
    if total == 0:
        return 0

    res = legacy_col.get(include=["documents", "metadatas", "embeddings"], limit=total)
    new_col = get_collection()
    batch = 50
    ids = res["ids"]
    docs = res["documents"] or []
    metas = res["metadatas"] or []
    embs = res.get("embeddings") or []

    for i in range(0, len(ids), batch):
        b_ids  = ids[i : i + batch]
        b_docs = docs[i : i + batch]
        b_meta = metas[i : i + batch]
        if embs:
            b_embs = embs[i : i + batch]
            new_col.upsert(ids=b_ids, embeddings=b_embs, documents=b_docs, metadatas=b_meta)
        else:
            embed_fn = _get_embed_fn()
            b_embs = embed_fn(b_docs)
            new_col.upsert(ids=b_ids, embeddings=b_embs, documents=b_docs, metadatas=b_meta)

    return len(ids)
