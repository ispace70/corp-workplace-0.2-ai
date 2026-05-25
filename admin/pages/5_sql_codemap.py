"""Page 5: 코드맵 관리 (공통코드 alias)"""
import os
import sys
from pathlib import Path

import streamlit as st
import duckdb
import pandas as pd
from dotenv import load_dotenv

sys.path.insert(0, str(Path(__file__).parent.parent))
load_dotenv(dotenv_path=str(Path(__file__).parent.parent.parent / ".env"))

from services import meta_store

meta_store.init_db()

st.title("🗂️ 코드맵 관리")
st.caption("DuckDB 공통코드를 조회하고 NL2SQL 프롬프트용 한국어 alias를 관리합니다.")

DB_PATH = os.getenv("DUCKDB_PATH", "/Users/sdh/ispace.db")


# ── 공통코드 테이블 조회 ───────────────────────────────────────────────────

with st.expander("📋 공통코드 테이블 조회 (읽기전용)", expanded=False):
    code_table = st.text_input("테이블명", value="MV_SCM_CMMN_CD")
    limit_n = st.number_input("조회 건수", min_value=10, max_value=1000, value=100, step=10)
    if st.button("조회"):
        try:
            con = duckdb.connect(DB_PATH, read_only=True)
            rows = con.execute(f"SELECT * FROM {code_table} LIMIT {limit_n}").fetchdf()
            con.close()
            st.dataframe(rows, use_container_width=True)
        except Exception as e:
            st.error(f"조회 실패: {e}")

st.divider()


# ── 사용자 정의 alias 편집 ────────────────────────────────────────────────

st.subheader("사용자 정의 코드 Alias")
st.caption("CMMN_GROUP_CD → 한국어 의미를 매핑합니다. 이 정보는 SQL 생성 프롬프트에 활용됩니다.")

aliases = meta_store.list_code_aliases()
alias_df = pd.DataFrame(aliases if aliases else [{"group_cd": "", "alias_name": "", "updated_at": ""}])

edited = st.data_editor(
    alias_df[["group_cd", "alias_name"]],
    num_rows="dynamic",
    use_container_width=True,
    key="alias_editor",
)

if st.button("💾 Alias 저장"):
    # 기존 전체 삭제 후 재삽입
    for row in aliases:
        meta_store.delete_code_alias(row["group_cd"])
    saved = 0
    for _, row in edited.iterrows():
        gcd = str(row.get("group_cd", "")).strip()
        aname = str(row.get("alias_name", "")).strip()
        if gcd and aname:
            meta_store.upsert_code_alias(gcd, aname)
            saved += 1
    st.success(f"{saved}개 alias 저장 완료")

st.divider()


# ── 프롬프트 조각 내보내기 ────────────────────────────────────────────────

st.subheader("📤 프롬프트 조각 내보내기")
st.caption("저장된 alias를 SQL 생성 프롬프트에 붙여넣을 수 있는 텍스트로 변환합니다.")

if st.button("생성"):
    aliases_now = meta_store.list_code_aliases()
    if not aliases_now:
        st.info("저장된 alias가 없습니다.")
    else:
        lines = ["## 공통코드 그룹 설명"]
        for a in aliases_now:
            lines.append(f"- {a['group_cd']}: {a['alias_name']}")
        fragment = "\n".join(lines)
        st.text_area("프롬프트 조각 (복사 후 SQL 생성 프롬프트에 붙여넣기)", value=fragment, height=200)
