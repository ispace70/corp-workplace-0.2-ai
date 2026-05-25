# Corp Workplace AI — 운영 지침

## 개요
기업 내부 AI 워크플레이스. Knowledge Agent(RAG)와 SQL Agent(NL2SQL)로 구성된 FastAPI + Next.js 시스템.

## 백엔드 실행 (port 8009)
```bash
cd /Users/sdh/Desktop/agent-test/corp-workplace
pip install -r requirements.txt
cd backend
python main.py
```

## 프론트엔드 실행 (port 3000)
```bash
cd /Users/sdh/Desktop/agent-test/corp-workplace/frontend
npm install
npm run dev
```

## 주요 API

| Method | Endpoint | 설명 |
|--------|----------|------|
| POST | `/chat` | 채팅 (SSE 스트리밍, mode: auto/knowledge/sql) |
| POST | `/sql/execute` | SQL 직접 실행 (SSE 스트리밍) |
| GET | `/db/tables` | DuckDB 테이블 목록 |
| GET | `/health` | 서버 상태 확인 |

## 환경변수 (.env)
- `GCP_LLM_URL`: GCP LLM 서버 URL (default: http://localhost:8001)
- `DUCKDB_PATH`: DuckDB 파일 경로
- `CHROMA_PATH`: ChromaDB 디렉토리 경로
- `EMBEDDING_MODEL`: HuggingFace 임베딩 모델명

## 알려진 제약사항
- GCP LLM은 `http://localhost:8001/chat`에서 SSE 스트리밍 제공
- ChromaDB는 `/resources` 디렉토리에 영구 저장
- DuckDB는 read-only 모드로 연결 (데이터 변경 불가)
- Knowledge Agent는 문서가 ChromaDB에 인제스트된 상태에서만 동작

## 향후 계획
- 문서 수집(Ingestion) 파이프라인 구축
- 멀티 사용자 세션 관리 (SQLite 기반)
- 테이블별 한국어 스키마 설명 (`resources/schema_descriptions.json`)
