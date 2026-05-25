"""Page 4: SQL Few-Shot 예시 관리"""
import sys
import json
from pathlib import Path

import streamlit as st
import duckdb

sys.path.insert(0, str(Path(__file__).parent.parent))

from services import meta_store, database_chroma

meta_store.init_db()

st.title("🎯 Few-Shot 예시 관리")
st.caption("NL2SQL에 활용할 질문→SQL 페어를 관리합니다.")


def _validate_sql(sql: str) -> tuple[bool, str]:
    """DuckDB EXPLAIN으로 SQL 문법 검증."""
    import os
    from dotenv import load_dotenv
    load_dotenv(dotenv_path=str(Path(__file__).parent.parent.parent / ".env"))
    db_path = os.getenv("DUCKDB_PATH", "/Users/sdh/ispace.db")
    try:
        con = duckdb.connect(db_path, read_only=True)
        con.execute(f"EXPLAIN {sql}")
        con.close()
        return True, ""
    except Exception as e:
        return False, str(e)


# ── 추가 폼 ──────────────────────────────────────────────────────────────

with st.expander("➕ 새 예시 추가", expanded=False):
    new_q   = st.text_input("자연어 질문", key="new_q")
    new_sql = st.text_area("SQL 쿼리", height=120, key="new_sql")
    if st.button("검증 후 저장", key="add_fewshot"):
        if not new_q.strip() or not new_sql.strip():
            st.error("질문과 SQL을 모두 입력하세요.")
        else:
            ok, err = _validate_sql(new_sql)
            if not ok:
                st.warning(f"SQL 문법 경고: {err}\n계속 저장하시겠습니까?")
                st.session_state["pending_save"] = {"question": new_q, "sql": new_sql}
            else:
                doc = meta_store.create_fewshot(new_q, new_sql)
                database_chroma.index_fewshot(doc["id"], new_q, new_sql)
                st.success("저장 완료!")
                st.rerun()

# 경고 이후 강제 저장
if "pending_save" in st.session_state:
    ps = st.session_state["pending_save"]
    if st.button(f"⚠️ 경고 무시하고 저장: '{ps['question'][:30]}...'"):
        doc = meta_store.create_fewshot(ps["question"], ps["sql"])
        database_chroma.index_fewshot(doc["id"], ps["question"], ps["sql"])
        del st.session_state["pending_save"]
        st.success("저장 완료!")
        st.rerun()

st.divider()


# ── JSON 일괄 import ──────────────────────────────────────────────────────

with st.expander("📥 JSON 일괄 Import"):
    json_file = st.file_uploader("JSON 파일 선택", type=["json"], key="json_import")
    if json_file and st.button("Import 실행"):
        try:
            items = json.loads(json_file.read().decode("utf-8"))
            ok_count, err_count = 0, 0
            for item in items:
                q = item.get("question", "").strip()
                s = item.get("sql", "").strip()
                if q and s:
                    doc = meta_store.create_fewshot(q, s)
                    database_chroma.index_fewshot(doc["id"], q, s)
                    ok_count += 1
                else:
                    err_count += 1
            st.success(f"Import 완료: 성공 {ok_count}건 / 스킵 {err_count}건")
            st.rerun()
        except Exception as e:
            st.error(f"Import 실패: {e}")

st.divider()


# ── 목록 ─────────────────────────────────────────────────────────────────

st.subheader("등록된 예시 목록")

if st.button("🔄 새로고침"):
    st.rerun()

fewshots = meta_store.list_fewshots()
if not fewshots:
    st.info("등록된 예시가 없습니다.")
else:
    st.caption(f"총 {len(fewshots)}개")
    for fs in fewshots:
        with st.expander(f"Q: {fs['question'][:80]}"):
            edit_key = f"edit_{fs['id']}"
            if st.session_state.get(edit_key):
                eq = st.text_input("질문", value=fs["question"], key=f"eq_{fs['id']}")
                es = st.text_area("SQL", value=fs["sql"], height=100, key=f"es_{fs['id']}")
                cc1, cc2 = st.columns(2)
                if cc1.button("💾 저장", key=f"esave_{fs['id']}"):
                    meta_store.update_fewshot(fs["id"], eq, es)
                    database_chroma.update_fewshot(fs["id"], eq, es)
                    st.session_state[edit_key] = False
                    st.rerun()
                if cc2.button("취소", key=f"ecancel_{fs['id']}"):
                    st.session_state[edit_key] = False
                    st.rerun()
            else:
                st.code(fs["sql"], language="sql")
                st.caption(f"등록: {fs['created_at']}  |  수정: {fs['updated_at']}")
                bc1, bc2 = st.columns(2)
                if bc1.button("✏️ 편집", key=f"bedit_{fs['id']}"):
                    st.session_state[edit_key] = True
                    st.rerun()
                if bc2.button("🗑️ 삭제", key=f"bdel_{fs['id']}"):
                    database_chroma.delete_fewshot(fs["id"])
                    meta_store.delete_fewshot(fs["id"])
                    st.success("삭제 완료")
                    st.rerun()

st.divider()


# ── 유사도 검색 미리보기 ──────────────────────────────────────────────────

st.subheader("🔍 유사도 검색 미리보기")
search_q = st.text_input("테스트 질문 입력", key="search_q")
if st.button("검색") and search_q:
    results = database_chroma.search_fewshots(search_q, top_k=5)
    if results:
        for r in results:
            st.write(f"**유사도: {r['score']}**  — {r['question']}")
            st.code(r["sql"], language="sql")
    else:
        st.info("검색 결과 없음 (등록된 예시 없거나 임베딩 미설정)")
