"""Page 3: SQL 시스템 프롬프트 관리"""
import os
import sys
from pathlib import Path

import streamlit as st

sys.path.insert(0, str(Path(__file__).parent.parent))

from services import meta_store
from utils.llm_client import stream_llm

meta_store.init_db()

st.title("📝 SQL 시스템 프롬프트")
st.caption("NL2SQL에 사용되는 프롬프트를 편집하고 GCP LLM으로 테스트할 수 있습니다.")

PROMPT_KEYS = {
    "의도 분석": "sql_intent_prompt",
    "SQL 생성": "sql_gen_prompt",
    "답변 생성": "sql_answer_prompt",
    "SQL 수정": "sql_fix_prompt",
}

tabs = st.tabs(list(PROMPT_KEYS.keys()))

for tab, (label, key) in zip(tabs, PROMPT_KEYS.items()):
    with tab:
        current = meta_store.get_setting(key)
        new_val = st.text_area(f"{label} 프롬프트", value=current, height=300, key=f"ta_{key}")

        c1, c2 = st.columns(2)
        if c1.button("💾 저장", key=f"save_{key}"):
            meta_store.update_setting(key, new_val)
            st.success("저장되었습니다.")

        if c2.button("↩️ 기본값 복원", key=f"reset_{key}"):
            default = meta_store.get_default_prompt(key)
            meta_store.update_setting(key, default)
            st.success("기본값으로 복원되었습니다.")
            st.rerun()

st.divider()


# ── 프롬프트 테스트 ────────────────────────────────────────────────────────

st.subheader("🧪 프롬프트 테스트 (GCP LLM)")
test_q = st.text_input("테스트 질문 입력")

if st.button("테스트 실행") and test_q:
    system_prompt = meta_store.get_setting("sql_intent_prompt")
    with st.spinner("GCP LLM 호출 중..."):
        result = st.write_stream(
            stream_llm([{"role": "user", "content": test_q}], system=system_prompt)
        )

st.divider()


# ── DB 스키마 미리보기 ─────────────────────────────────────────────────────

with st.expander("📊 현재 DuckDB 스키마 미리보기"):
    import duckdb
    from dotenv import load_dotenv
    load_dotenv(dotenv_path=str(Path(__file__).parent.parent.parent / ".env"))
    db_path = os.getenv("DUCKDB_PATH", "/Users/sdh/ispace.db")
    try:
        con = duckdb.connect(db_path, read_only=True)
        tables = con.execute("SHOW TABLES").fetchall()
        for (tbl,) in tables:
            st.write(f"**{tbl}**")
            cols = con.execute(f"DESCRIBE {tbl}").fetchall()
            st.dataframe(
                [{"column": c[0], "type": c[1]} for c in cols],
                use_container_width=True,
                hide_index=True,
            )
        con.close()
    except Exception as e:
        st.error(f"DuckDB 연결 실패: {e}")
