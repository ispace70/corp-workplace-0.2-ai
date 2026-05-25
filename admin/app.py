"""Corp Workplace Admin — Streamlit 멀티페이지 진입점"""
import os
import sys
from pathlib import Path

from dotenv import load_dotenv
import streamlit as st

# .env 로드 (admin/app.py 기준 ../  = corp-workplace/)
load_dotenv(dotenv_path=str(Path(__file__).parent.parent / ".env"))

sys.path.insert(0, str(Path(__file__).parent))

st.set_page_config(
    page_title="Corp AI Admin",
    page_icon="🛠️",
    layout="wide",
    initial_sidebar_state="expanded",
)

pages = {
    "지식검색 관리": [
        st.Page("pages/1_knowledge_docs.py",     title="📄 문서 관리",        url_path="knowledge-docs"),
        st.Page("pages/2_knowledge_settings.py", title="⚙️ 설정 / 벡터 갱신",  url_path="knowledge-settings"),
    ],
    "데이터분석 관리": [
        st.Page("pages/3_sql_prompts.py",  title="📝 시스템 프롬프트",   url_path="sql-prompts"),
        st.Page("pages/4_sql_fewshot.py",  title="🎯 Few-Shot 예시",     url_path="sql-fewshot"),
        st.Page("pages/5_sql_codemap.py",  title="🗂️ 코드맵",           url_path="sql-codemap"),
    ],
}

pg = st.navigation(pages)

# 사이드바 하단 정보
with st.sidebar:
    st.divider()
    st.caption("Corp AI Workplace Admin")
    st.caption("Backend: [http://localhost:8009](http://localhost:8009)")
    st.caption("Frontend: [http://localhost:3000](http://localhost:3000)")

pg.run()
