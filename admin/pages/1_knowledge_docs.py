"""Page 1: 지식검색 문서 관리"""
import os
import sys
import threading
import uuid
from pathlib import Path

import streamlit as st

sys.path.insert(0, str(Path(__file__).parent.parent))

from services import meta_store, knowledge_chroma
from services.doc_loader import load_document
from services.url_crawler import fetch_url, url_to_filename

UPLOAD_DIR = os.getenv(
    "ADMIN_UPLOAD_DIR",
    str(Path(__file__).parent.parent.parent / "admin" / "uploads"),
)

meta_store.init_db()
os.makedirs(UPLOAD_DIR, exist_ok=True)

st.title("📄 문서 관리")
st.caption("문서를 업로드하면 자동으로 청킹·임베딩하여 ChromaDB에 저장합니다.")


# ── 업로드 ────────────────────────────────────────────────────────────────

st.subheader("문서 업로드")
uploaded = st.file_uploader(
    "파일 선택 (복수 선택 가능)",
    type=["pdf", "docx", "doc", "txt", "md", "html", "htm",
          "hwpx", "hwp", "xlsx", "xls", "pptx", "ppt"],
    accept_multiple_files=True,
)

if uploaded and st.button("업로드 및 인덱싱 시작", type="primary"):
    chunk_size    = int(meta_store.get_setting("chunk_size", "500"))
    chunk_overlap = int(meta_store.get_setting("chunk_overlap", "50"))

    for f in uploaded:
        ext = Path(f.name).suffix.lower()
        uid = str(uuid.uuid4())
        save_path = os.path.join(UPLOAD_DIR, f"{uid}{ext}")
        with open(save_path, "wb") as fp:
            fp.write(f.read())

        doc = meta_store.create_document(f.name, ext.lstrip("."), save_path)
        doc_id = doc["id"]
        st.info(f"📥 **{f.name}** 인덱싱 시작...")

        def _worker(did=doc_id, path=save_path, fname=f.name, cs=chunk_size, co=chunk_overlap):
            try:
                pages = load_document(path)
                count = knowledge_chroma.index_document(did, fname, pages, cs, co)
                meta_store.update_document_status(did, "indexed", count)
            except Exception as e:
                meta_store.update_document_status(did, "error")
                print(f"[ERROR] 인덱싱 실패 ({fname}): {e}")

        threading.Thread(target=_worker, daemon=True).start()

    st.success("인덱싱이 백그라운드에서 실행 중입니다. 잠시 후 새로고침하세요.")


st.divider()


# ── URL 학습 ──────────────────────────────────────────────────────────────

st.subheader("🌐 URL 학습")
st.caption("웹 페이지 URL을 입력하면 텍스트를 추출하여 ChromaDB에 저장합니다.")

url_input = st.text_input("URL 입력", placeholder="https://example.com/page")

col_preview, col_index = st.columns(2)

with col_preview:
    if st.button("미리보기", disabled=not url_input):
        with st.spinner("페이지 로딩 중..."):
            try:
                text = fetch_url(url_input)
                st.text_area("추출된 텍스트 (일부)", value=text[:2000], height=200, disabled=True)
                st.caption(f"전체 {len(text):,}자")
            except Exception as e:
                st.error(f"URL 로드 실패: {e}")

with col_index:
    if st.button("인덱싱 시작", type="primary", disabled=not url_input):
        chunk_size    = int(meta_store.get_setting("chunk_size", "500"))
        chunk_overlap = int(meta_store.get_setting("chunk_overlap", "50"))
        fname = url_to_filename(url_input) + ".html"
        doc   = meta_store.create_document(fname, "url", url_input)
        doc_id = doc["id"]
        st.info(f"📥 **{fname}** 인덱싱 시작...")

        def _url_worker(did=doc_id, url=url_input, fn=fname, cs=chunk_size, co=chunk_overlap):
            try:
                text  = fetch_url(url)
                pages = [{"text": text, "page": 1}]
                count = knowledge_chroma.index_document(did, fn, pages, cs, co)
                meta_store.update_document_status(did, "indexed", count)
            except Exception as e:
                meta_store.update_document_status(did, "error")
                print(f"[ERROR] URL 인덱싱 실패 ({url}): {e}")

        threading.Thread(target=_url_worker, daemon=True).start()
        st.success("백그라운드 인덱싱 시작됨. 잠시 후 새로고침하세요.")


st.divider()


# ── 문서 목록 ─────────────────────────────────────────────────────────────

st.subheader("인덱싱된 문서 목록")

col_refresh, col_space = st.columns([1, 5])
with col_refresh:
    if st.button("🔄 새로고침"):
        st.rerun()

docs = meta_store.list_documents()
if not docs:
    st.info("아직 업로드된 문서가 없습니다.")
else:
    STATUS_ICON = {"indexed": "✅", "pending": "⏳", "error": "❌"}

    for doc in docs:
        icon = STATUS_ICON.get(doc["status"], "❓")
        with st.expander(f"{icon} {doc['filename']}  |  청크 {doc['chunk_count']}개  |  {doc['created_at']}"):
            c1, c2, c3 = st.columns([2, 1, 1])
            type_label = "🌐 URL" if doc["file_type"] == "url" else f"📄 {doc['file_type']}"
            source_info = f"  |  출처: {doc['file_path']}" if doc["file_type"] == "url" else ""
            c1.caption(f"ID: `{doc['id']}`  |  상태: **{doc['status']}**  |  {type_label}{source_info}")

            if c2.button("🔄 재인덱싱", key=f"reindex_{doc['id']}"):
                meta_store.update_document_status(doc["id"], "pending")
                cs = int(meta_store.get_setting("chunk_size", "500"))
                co = int(meta_store.get_setting("chunk_overlap", "50"))

                if doc["file_type"] == "url":
                    def _reindex_url(did=doc["id"], url=doc["file_path"], fname=doc["filename"],
                                     cs=cs, co=co):
                        try:
                            knowledge_chroma.delete_document(did)
                            text  = fetch_url(url)
                            pages = [{"text": text, "page": 1}]
                            count = knowledge_chroma.index_document(did, fname, pages, cs, co)
                            meta_store.update_document_status(did, "indexed", count)
                        except Exception as e:
                            meta_store.update_document_status(did, "error")
                            print(f"[ERROR] URL 재인덱싱 실패: {e}")
                    threading.Thread(target=_reindex_url, daemon=True).start()
                else:
                    file_path = doc["file_path"]
                    if not os.path.exists(file_path):
                        st.error("원본 파일을 찾을 수 없습니다.")
                    else:
                        def _reindex(did=doc["id"], path=file_path, fname=doc["filename"],
                                     cs=cs, co=co):
                            try:
                                knowledge_chroma.delete_document(did)
                                pages = load_document(path)
                                count = knowledge_chroma.index_document(did, fname, pages, cs, co)
                                meta_store.update_document_status(did, "indexed", count)
                            except Exception as e:
                                meta_store.update_document_status(did, "error")
                                print(f"[ERROR] 재인덱싱 실패: {e}")
                        threading.Thread(target=_reindex, daemon=True).start()

                st.info("재인덱싱 시작됨. 잠시 후 새로고침하세요.")

            if c3.button("🗑️ 삭제", key=f"del_{doc['id']}"):
                knowledge_chroma.delete_document(doc["id"])
                meta_store.delete_document(doc["id"])
                file_path = doc.get("file_path", "")
                if file_path and os.path.exists(file_path):
                    os.remove(file_path)
                st.success(f"**{doc['filename']}** 삭제 완료")
                st.rerun()
