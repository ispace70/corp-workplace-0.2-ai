"""Page 2: 지식검색 설정 / 벡터 갱신"""
import os
import sys
import threading
from pathlib import Path

import streamlit as st

sys.path.insert(0, str(Path(__file__).parent.parent))

from services import meta_store, knowledge_chroma
from services.doc_loader import load_document

meta_store.init_db()

st.title("⚙️ 지식검색 설정")


# ── 컬렉션 통계 ───────────────────────────────────────────────────────────

st.subheader("컬렉션 현황")
try:
    stats = knowledge_chroma.get_stats()
    c1, c2 = st.columns(2)
    c1.metric("총 청크 수", stats["total_chunks"])
    c2.metric("인덱싱된 문서 수", stats["doc_count"])
except Exception as e:
    st.warning(f"ChromaDB 연결 오류: {e}")

st.divider()


# ── 청킹 파라미터 ─────────────────────────────────────────────────────────

st.subheader("청킹 파라미터")
chunk_size    = st.number_input("Chunk Size (문자)", min_value=100, max_value=5000,
                                 value=int(meta_store.get_setting("chunk_size", "500")), step=100)
chunk_overlap = st.number_input("Chunk Overlap (문자)", min_value=0, max_value=500,
                                 value=int(meta_store.get_setting("chunk_overlap", "50")), step=10)

if st.button("설정 저장"):
    meta_store.update_setting("chunk_size", str(chunk_size))
    meta_store.update_setting("chunk_overlap", str(chunk_overlap))
    st.success("저장되었습니다. 이후 업로드/재인덱싱 시 적용됩니다.")

st.divider()


# ── 전체 재인덱싱 ─────────────────────────────────────────────────────────

st.subheader("전체 벡터 재구축")
st.caption("ChromaDB를 초기화하고 현재 추적 중인 모든 문서를 다시 인덱싱합니다.")

if "rebuild_running" not in st.session_state:
    st.session_state.rebuild_running = False

if st.button("🔁 전체 재인덱싱", disabled=st.session_state.rebuild_running):
    docs = meta_store.list_documents()
    if not docs:
        st.warning("인덱싱할 문서가 없습니다.")
    else:
        st.session_state.rebuild_running = True
        cs = int(meta_store.get_setting("chunk_size", "500"))
        co = int(meta_store.get_setting("chunk_overlap", "50"))

        def _rebuild():
            try:
                knowledge_chroma.delete_all()
                for doc in docs:
                    if not os.path.exists(doc["file_path"]):
                        meta_store.update_document_status(doc["id"], "error")
                        continue
                    meta_store.update_document_status(doc["id"], "pending")
                    try:
                        pages = load_document(doc["file_path"])
                        count = knowledge_chroma.index_document(doc["id"], doc["filename"], pages, cs, co)
                        meta_store.update_document_status(doc["id"], "indexed", count)
                    except Exception as e:
                        meta_store.update_document_status(doc["id"], "error")
                        print(f"[ERROR] 재구축 실패 ({doc['filename']}): {e}")
            finally:
                st.session_state.rebuild_running = False

        threading.Thread(target=_rebuild, daemon=True).start()
        st.info(f"{len(docs)}개 문서 재인덱싱 시작됨. 완료 후 페이지 1에서 상태를 확인하세요.")

st.divider()


# ── 레거시 마이그레이션 ────────────────────────────────────────────────────

st.subheader("레거시 벡터 마이그레이션")
st.caption("기존 `resources/` 디렉토리의 벡터를 새 `resources/chroma/knowledge/`로 복사합니다.")

legacy_path = st.text_input(
    "레거시 ChromaDB 경로",
    value=str(Path(__file__).parent.parent.parent / "resources"),
)

if st.button("📦 마이그레이션 시작"):
    if not os.path.exists(legacy_path):
        st.error(f"경로를 찾을 수 없습니다: {legacy_path}")
    else:
        with st.spinner("마이그레이션 중..."):
            try:
                count = knowledge_chroma.migrate_from_legacy(legacy_path)
                st.success(f"✅ {count}개 청크 마이그레이션 완료 → `resources/chroma/knowledge/`")
            except Exception as e:
                st.error(f"마이그레이션 실패: {e}")
