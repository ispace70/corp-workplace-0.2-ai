# Corp Workplace AI — 현행 소스 사양서

> **목적**: 이 문서 하나로 동일한 소스를 재생성할 수 있도록 현재 구현 상태를 정확하게 기술한다.
> **최종 업데이트**: 2026-05-21

---

## 1. 프로젝트 개요

기업 내부 데이터와 문서를 AI Agent로 접근·분석하는 워크플레이스.

| 기능 | 설명 |
|---|---|
| **지식검색 (Knowledge Agent)** | PDF/DOCX/HWP 등 사내 문서를 ChromaDB에 인덱싱, 자연어 질의로 검색·요약 |
| **데이터분석 (SQL Agent)** | DuckDB 데이터를 NL2SQL로 조회·분석, SQL 수정 후 재실행 지원 |
| **어드민 (Admin)** | 문서 인덱싱, 시스템 프롬프트, Few-Shot 예시, 코드맵 관리 |

**제약**: 외부 LLM 사용 금지. GCP 내부 LLM 프록시(`localhost:8001`) 전용.

---

## 2. 시스템 아키텍처

```
[사용자 브라우저 :3000]          [관리자 브라우저 :8002]
        │                                  │
        ▼                                  ▼
[Next.js Frontend :3000]     [React+Vite Admin :8002]
        │                                  │
        └──────────────┬────────────────────┘
                       ▼
            [FastAPI Backend :8009]
            ├── /chat (SSE 스트리밍)
            ├── /sql/execute (SSE 스트리밍)
            ├── /db/tables
            ├── /health
            └── /admin/** (Admin API)
                       │
          ┌────────────┼────────────┐
          ▼            ▼            ▼
   [KnowledgeAgent] [SQLAgent]  [AdminRouter]
   ChromaDB 검색    DuckDB 쿼리  메타DB/파일 관리
          │            │
          └─────┬──────┘
                ▼
     [GCP LLM Proxy :8001]
     provider: gcp_vm, stream=True
```

---

## 3. 디렉토리 구조

```
corp-workplace/
├── frontend/                    # Next.js 14 (port 3000)
│   ├── src/
│   │   ├── app/
│   │   │   ├── layout.tsx
│   │   │   └── page.tsx
│   │   ├── components/
│   │   │   ├── Sidebar.tsx      # 좌측 네비게이션 (대시보드/지식검색/데이터분석)
│   │   │   ├── ChatPanel.tsx    # 채팅 영역 (SSE 스트리밍 수신)
│   │   │   ├── ContentPanel.tsx # 우측 패널 (소스 문서, SQL 결과)
│   │   │   ├── MessageBubble.tsx
│   │   │   ├── ChatInput.tsx
│   │   │   └── SqlEditor.tsx    # SQL 수정 + 실행 컴포넌트
│   │   ├── lib/api.ts           # axios 기반 API 클라이언트
│   │   └── types/index.ts
│   └── package.json
│
├── backend/                     # FastAPI (port 8009)
│   ├── main.py                  # 앱 진입점, .env 로드, CORS, 라우터 등록
│   ├── router.py                # /chat, /sql/execute, /db/tables, /health
│   ├── admin_router.py          # /admin/** (문서/설정/프롬프트/fewshot/코드맵/스키마)
│   └── agents/
│       ├── llm_client.py        # GCPChatLLM, stream_text_direct
│       ├── knowledge_agent.py   # RAG: ChromaDB + LangGraph + LLM
│       └── sql_agent.py         # NL2SQL: DuckDB + 파일 프롬프트 + 코드맵 + Few-shot
│
├── admin/                       # 어드민 서비스 레이어
│   ├── app.py                   # (미사용 — React Admin이 대체)
│   ├── frontend/                # React+Vite Admin UI (port 8002)
│   │   ├── src/
│   │   │   ├── App.tsx          # 레이아웃 + 사이드 메뉴
│   │   │   ├── lib/api.ts       # Admin API 클라이언트
│   │   │   └── pages/
│   │   │       ├── KnowledgeDocs.tsx     # 문서 업로드/삭제/재인덱스
│   │   │       ├── KnowledgeSettings.tsx # 청크 설정, 벡터 갱신
│   │   │       ├── SqlPrompts.tsx        # 시스템 프롬프트 파일 편집
│   │   │       ├── SqlFewshot.tsx        # Few-Shot 예시 CRUD
│   │   │       └── SqlCodemap.tsx        # __comm_code_map 조회 + 프롬프트 미리보기
│   │   └── vite.config.ts       # proxy: /admin → :8009/admin
│   └── services/
│       ├── meta_store.py        # admin_meta.duckdb CRUD (문서 메타, 설정, code_aliases)
│       ├── knowledge_chroma.py  # ChromaDB knowledge 컬렉션 관리
│       ├── database_chroma.py   # ChromaDB database 컬렉션 (현재 미사용)
│       ├── doc_loader.py        # PDF/DOCX/HWP/PPTX/XLSX/TXT 로더
│       ├── url_crawler.py       # 웹 크롤링 (BeautifulSoup)
│       └── embeddings.py        # OpenAI 또는 ONNX(384차원) 폴백
│
├── resources/
│   ├── prompts/
│   │   ├── sql_gen.md           # SQL 생성 프롬프트 (파일 기반, Admin에서 편집 가능)
│   │   ├── sql_answer.md        # 결과 설명 프롬프트
│   │   └── sql_fix.md           # SQL 오류 수정 프롬프트
│   ├── sql_fewshots.yml         # Few-Shot 예시 (파일 기반, Admin에서 CRUD)
│   ├── admin_meta.duckdb        # 어드민 메타데이터 DB (문서 목록, 설정, code_aliases)
│   └── chroma/
│       └── knowledge/           # ChromaDB 지식검색 벡터 저장소
│
├── directives/
│   └── corp_workplace.md        # SOP 문서
├── execution/
│   ├── ingest_documents.py
│   ├── start_backend.sh
│   └── start_frontend.sh
├── .env                         # 환경변수 (아래 참조)
├── requirements.txt
├── start.sh                     # 전체 스택 시작 (백엔드+프론트+어드민)
└── stop.sh
```

---

## 4. 환경변수 (.env)

```env
GCP_LLM_URL=http://localhost:8001          # GCP LLM 프록시 URL
DUCKDB_PATH=/Users/sdh/ispace.db           # 데이터 분석용 DuckDB (절대 경로)

CHROMA_PATH=/Users/sdh/Desktop/agent-test/corp-workplace/resources
CHROMA_PATH_KNOWLEDGE=/Users/sdh/Desktop/agent-test/corp-workplace/resources/chroma/knowledge
CHROMA_PATH_DATABASE=/Users/sdh/Desktop/agent-test/corp-workplace/resources/chroma/database

OPENAI_API_KEY=                            # 비워두면 ONNX(384차원) 폴백 사용
EMBEDDING_MODEL=text-embedding-3-large

NEXT_PUBLIC_API_URL=http://localhost:8009
NEXT_PUBLIC_THEME=white                    # white | dark | nanoBanana

ADMIN_META_DB=/Users/sdh/Desktop/agent-test/corp-workplace/resources/admin_meta.duckdb
ADMIN_UPLOAD_DIR=/Users/sdh/Desktop/agent-test/corp-workplace/admin/uploads
```

---

## 5. 서비스 포트

| 서비스 | 포트 | 시작 방법 |
|---|---|---|
| 사용자 Frontend (Next.js) | 3000 | `npm run dev` in `frontend/` |
| Backend (FastAPI) | 8009 | `python3.13 main.py` in `backend/` |
| Admin UI (React+Vite) | 8002 | `npm run dev` in `admin/frontend/` |
| GCP LLM Proxy | 8001 | 별도 `agent-connect-llm` 프로세스 (루트 디렉토리에서 시작) |

전체 시작: `./start.sh` / 전체 종료: `./stop.sh`

---

## 6. Backend API 명세 (FastAPI :8009)

### 6.1 채팅 API

| Method | Endpoint | 설명 |
|---|---|---|
| `GET` | `/health` | 서버 상태 확인 |
| `GET` | `/db/tables` | DuckDB 테이블 목록 (테이블명, 컬럼, 한글 코멘트 포함) |
| `POST` | `/chat` | 채팅 요청 — SSE 스트리밍 |
| `POST` | `/sql/execute` | SQL 실행 + 결과 해석 — SSE 스트리밍 |

**POST /chat 요청:**
```json
{ "message": "질문 텍스트", "mode": "auto|knowledge|sql", "session_id": "default" }
```

**SSE 이벤트 타입:**
```
{"type": "route",      "content": "knowledge|sql|general"}
{"type": "text",       "content": "마크다운 텍스트 청크"}
{"type": "sources",    "content": [{"source": "파일명", "page": 1, "content": "..."}]}
{"type": "sql_review", "content": "SELECT ..."}   # 사용자 검토용 SQL
{"type": "sql_result", "content": {"columns": [], "rows": [], "row_count": 0}}
data: [DONE]
```

**POST /sql/execute 요청:**
```json
{ "sql": "SELECT ...", "query": "원본 자연어 질문", "session_id": "default" }
```

### 6.2 Admin API (`/admin/**`)

| Method | Endpoint | 설명 |
|---|---|---|
| `GET` | `/admin/stats` | 통계 (청크 수, 문서 수, 인덱싱 수) |
| `GET/POST` | `/admin/docs` | 문서 목록 / 파일 업로드 (백그라운드 인덱싱) |
| `POST` | `/admin/docs/site` | URL 크롤링 후 인덱싱 |
| `DELETE` | `/admin/docs/{id}` | 문서 삭제 |
| `POST` | `/admin/docs/{id}/reindex` | 재인덱싱 |
| `GET/PUT` | `/admin/settings` | 청크 설정 (chunk_size, chunk_overlap) |
| `GET` | `/admin/prompts` | 시스템 프롬프트 파일 전체 조회 |
| `PUT` | `/admin/prompts/{key}` | 시스템 프롬프트 파일 저장 (key: sql_gen, sql_answer, sql_fix) |
| `GET/POST` | `/admin/fewshots` | Few-Shot 예시 목록 / 추가 |
| `PUT/DELETE` | `/admin/fewshots/{id}` | 수정 / 삭제 |
| `GET` | `/admin/codemap` | `__comm_code_map` 전체 조회 (85행) |
| `GET` | `/admin/codemap/prompt` | 프롬프트 주입 코드맵 문자열 미리보기 |
| `POST` | `/admin/vector/refresh` | 전체 벡터 재구축 |
| `GET` | `/admin/schema` | DuckDB 스키마 (테이블 코멘트 + 컬럼 코멘트 포함) |

---

## 7. Backend 핵심 구현

### 7.1 LLM 클라이언트 (`backend/agents/llm_client.py`)

- `GCP_LLM_URL=http://localhost:8001`, `provider=gcp_vm`
- **반드시 `stream=True`** 로 호출 — SSE/NDJSON 라인 파싱
- `_stream_raw()`: requests `stream=True` → `iter_lines()` → `data: ` prefix 제거 → JSON 파싱 → 텍스트 yield
- `_call_llm()`: `"".join(_stream_raw(...))` — 동기 전체 텍스트 반환
- `GCPChatLLM`: LangChain `BaseChatModel` 구현 (`_generate`, `_stream`, `_astream`)
- `stream_text_direct()`: LangChain 오버헤드 없는 직접 스트리밍 (threading + asyncio.Queue)
- timeout: 연결 10초, 읽기 600초

```python
def _stream_raw(payload: List[Dict]) -> Iterator[str]:
    body = {"messages": payload, "provider": "gcp_vm", "stream": True}
    with requests.post(f"{GCP_LLM_URL}/chat", json=body, stream=True, timeout=(10, 600)) as resp:
        for line in resp.iter_lines():
            decoded = line.decode("utf-8") if isinstance(line, bytes) else line
            if decoded.startswith("data: "): decoded = decoded[6:]
            if decoded in ("[DONE]", ""): continue
            try:
                text = _extract_text(json.loads(decoded))
                if text: yield text
            except json.JSONDecodeError:
                if decoded.strip(): yield decoded
```

### 7.2 라우터 (`backend/router.py`)

- `POST /chat` → SSE StreamingResponse with `_heartbeat_wrap` (15초마다 SSE comment 전송)
- 모드 분기: `mode=auto` → `_classify_query()` LLM 호출 → knowledge/sql/general
- `_classify_query()`: `asyncio.to_thread()` 로 event loop 블로킹 방지
- `mode=knowledge|sql` 일 때는 분류 LLM 호출 생략

### 7.3 Knowledge Agent (`backend/agents/knowledge_agent.py`)

```
astream(query)
  1. yield route=knowledge
  2. yield text="📚 검색 중..."
  3. LangGraph ainvoke → retrieve_node (ChromaDB k=5 검색)
  4. yield sources=[{source, page, content[:600]}]
  5. context = docs[0].page_content[:150]  (1개 문서 150자)
  6. prompt = "참고: {context}\n\n질문: {query}\n\n답변(한국어, 간략하게):"
  7. stream_text_direct(prompt) → yield text chunks
```

- 임베딩 우선순위: OpenAI API key → HuggingFace(torch) → ONNX 384차원 폴백
- ChromaDB: `PersistentClient` + `_find_collection_name()` (문서 수 최대 컬렉션 자동 선택)
- LangGraph: retrieve 노드 1개, StateGraph 구조 유지 (확장용)

### 7.4 SQL Agent (`backend/agents/sql_agent.py`)

```
astream(query)                              astream_execute(query, sql)
  1. yield route=sql                          1. 스키마+코드맵 병렬 조회 (asyncio.gather)
  2. 스키마+코드맵 병렬 조회 (asyncio.gather)  2. _execute_sql(sql) 최대 3회 시도
  3. _match_fewshots(query, top_k=3)          3. 실패 시 sql_fix.md 프롬프트로 LLM 수정
  4. sql_gen.md 프롬프트 포맷팅                4. yield sql_result
  5. LLM 호출 (asyncio.to_thread)             5. 결과 10행 미리보기
  6. _extract_sql()                           6. sql_answer.md 프롬프트 → stream_text_direct
  7. yield sql_review (사용자 검토)
```

**스키마 조회 (`_get_schema`):**
- `duckdb_tables()` → 테이블 코멘트 수집
- `duckdb_columns()` → 컬럼명, 타입, 한글 코멘트
- 포맷: `테이블: fcs_frcs_b (가맹점기본)\n컬럼: FRCS_ID(VARCHAR|가맹점아이디), ...`
- `__` prefix 테이블 제외 (`__comm_code_map` 등)

**코드맵 조회 (`_get_codemap`):**
- `__comm_code_map` 테이블 (85행): table_name, column_name, column_korea_name, column_value, korea_term, synonyms
- 포맷: `FCS_FRCS_B.FRCS_STTS_CD(가맹점상태코드): '001'=가입신청, '003'=가입완료/정상, ...`

**Few-Shot 매칭 (`_match_fewshots`):**
- `resources/sql_fewshots.yml` 파일 읽기
- question + tags 텍스트와 쿼리 단어 교집합 스코어링
- 상위 top_k=3 반환

**프롬프트 캐시**: `_schema_cache`, `_codemap_cache` (에이전트 인스턴스 생존 기간 유지)

---

## 8. 프롬프트 파일 (`resources/prompts/`)

### 8.1 sql_gen.md — SQL 생성

```
[Identity & Role]
수석 데이터 분석가 & DuckDB SQL 전문가

[Database Context]
환각 금지 + ## 스키마\n{schema}\n{codemap_section}{fewshot_section}

[Strict Rules]
1. SQL만 반환 (```sql...``` 블록)
2. 코드맵 한국어 → 정확한 코드값 매핑
3. INNER/LEFT JOIN 활용
4. SELECT만 허용 (INSERT/UPDATE/DELETE/DROP 금지)
5. DuckDB 문법 사용

[Question]
{query}
```

**플레이스홀더**: `{schema}`, `{codemap_section}`, `{fewshot_section}`, `{query}`

### 8.2 sql_answer.md — 결과 해석

```
데이터 분석 전문가 역할, 한국어 간결 답변, 숫자 포맷, 인사이트 제공
플레이스홀더: {query}, {sql}, {result}
```

### 8.3 sql_fix.md — SQL 오류 수정

```
오류 수정 후 SQL만 반환 (```sql...``` 블록)
플레이스홀더: {sql}, {error}, {schema}, {codemap_section}
```

---

## 9. Few-Shot 파일 (`resources/sql_fewshots.yml`)

```yaml
examples:
  - id: "<uuid>"
    question: "가입 완료된 가맹점 수를 알려줘"
    sql: |
      SELECT COUNT(*) AS 가입완료_가맹점수
      FROM fcs_frcs_b
      WHERE FRCS_STTS_CD = '003'
    tags: [가맹점, 가입완료, 수]
    created_at: "2025-..."
    updated_at: "2025-..."
```

- Admin UI에서 CRUD (질문, SQL, 태그 관리)
- SQL 에이전트가 질문 시 keyword 교집합 매칭으로 top_k=3 선택

---

## 10. 코드맵 (`ispace.db.__comm_code_map`)

SQL 에이전트가 코드값 의미를 파악하기 위해 런타임에 직접 조회하는 테이블.

```
컬럼: korea_term, table_name, column_name, column_korea_name,
      column_value, description, synonyms
```

**Admin에서 조회만 가능** (외부 데이터팀 관리 테이블이므로 수정 없음).

---

## 11. Admin 메타 DB (`resources/admin_meta.duckdb`)

`admin/services/meta_store.py` 가 관리하는 SQLite-like DuckDB.

| 테이블 | 내용 |
|---|---|
| `documents` | 업로드 문서 메타 (id, filename, file_type, file_path, status, chunk_count, created_at) |
| `settings` | key-value 설정 (chunk_size=500, chunk_overlap=50) |
| `code_aliases` | group_cd → alias_name (현재 에이전트 미사용, 추후 확장용) |

---

## 12. Admin UI (`admin/frontend/`)

React + Vite + Ant Design, 한국어 로케일.

| 메뉴 | 컴포넌트 | 기능 |
|---|---|---|
| 지식검색 / 문서 관리 | `KnowledgeDocs.tsx` | 파일 업로드, URL 크롤링, 문서 삭제/재인덱스, 상태 표시 |
| 지식검색 / 설정 | `KnowledgeSettings.tsx` | chunk_size, chunk_overlap, 전체 벡터 재구축 |
| 데이터분석 / 시스템 프롬프트 | `SqlPrompts.tsx` | sql_gen/sql_answer/sql_fix .md 파일 편집 + DuckDB 스키마 참조 |
| 데이터분석 / Few-Shot | `SqlFewshot.tsx` | YAML 파일 기반 CRUD (질문 + SQL + 태그) |
| 데이터분석 / 코드맵 | `SqlCodemap.tsx` | `__comm_code_map` 조회 (테이블 필터, 텍스트 검색) + 프롬프트 주입 미리보기 |

**API 프록시**: Vite `server.proxy` → `/admin` → `localhost:8009/admin`

---

## 13. Frontend (`frontend/`)

Next.js 14 App Router, Tailwind CSS, axios.

**테마 (`NEXT_PUBLIC_THEME`)**: `white` | `dark` | `nanoBanana`

**레이아웃:**
- `Sidebar.tsx`: 대시보드 / 지식검색 / 데이터분석 모드 선택 (slim 모드 지원)
- `ChatPanel.tsx`: SSE 스트리밍 수신, 메시지 버블 렌더링
- `ContentPanel.tsx`: 소스 문서 / SQL 결과 표시 (Split-view)
- `SqlEditor.tsx`: SQL 수정 + 실행 버튼 (sql_review 이벤트 수신 시 표시)
- `ChatInput.tsx`: 입력창 + 모드 선택

**SSE 처리 흐름:**
```
POST /chat → EventSource 수신
  route → 라우팅 표시
  text → 채팅 버블에 순차 append
  sources → ContentPanel에 문서 표시
  sql_review → SqlEditor 표시 (사용자 검토/수정)
  sql_result → ContentPanel에 데이터 테이블 표시
  [DONE] → 스트리밍 종료
```

---

## 14. 의존성

### requirements.txt (Python)

```
langchain>=0.2.0
langgraph>=0.1.0
langchain-community>=0.2.0
langchain-core>=0.2.0
chromadb>=0.5.0
duckdb>=1.0.0
fastapi>=0.111.0
uvicorn[standard]>=0.30.0
sentence-transformers>=3.0.0
python-dotenv>=1.0.0
requests>=2.31.0
sqlalchemy>=2.0.0
pydantic>=2.0.0
httpx>=0.27.0
pypdf>=4.0.0
python-docx>=1.1.0
python-pptx>=0.6.23
openpyxl>=3.1.0
beautifulsoup4>=4.12.0
lxml>=5.0.0
yaml (PyYAML)
```

### Frontend (주요 패키지)

```
next 14+, react, react-dom, axios, tailwindcss, framer-motion, lucide-react
```

### Admin Frontend (주요 패키지)

```
vite, react, antd (Ant Design), @ant-design/icons, axios
```

---

## 15. LLM 연동 (GCP 프록시)

```python
# 호출 방식 — 반드시 stream=True
payload = {
    "messages": [{"role": "user", "content": "질문"}],
    "provider": "gcp_vm",
    "stream": True
}
with requests.post("http://localhost:8001/chat", json=payload, stream=True) as resp:
    for line in resp.iter_lines():
        decoded = line.decode("utf-8")
        if decoded.startswith("data: "):
            data = decoded[6:]
            if data == "[DONE]": break
            chunk = json.loads(data).get("chunk", "")
            print(chunk, end="", flush=True)
```

**응답 JSON 키 우선순위**: `chunk` → `content` → `message` → `text` → `response` → `answer` → `output` → OpenAI `choices[].delta.content`

---

## 16. DuckDB 데이터 구조 (`/Users/sdh/ispace.db`)

| 테이블 | 한글명 | 주요 컬럼 |
|---|---|---|
| `MBR_MBR_B` | 회원정보 | MBR_ID, MBR_NM, MBL_TELNO, JOIN_DT, MBR_SEX_CD, MBR_STTS_CD |
| `fcs_frcs_b` | 가맹점기본 | FRCS_ID, FRCS_NM, FRCS_STTS_CD, FRCS_TPBIZ_CD, FRCS_SE_CD (70컬럼) |
| `PPM_DLNG_B` | 거래정보기본 | DLNG_NO, DLNG_SE_CD, ACCP_WAET_ID, GIVE_WAET_ID, DLNG_AMT, FRCS_ID |
| `PPM_WAET_PTCPT_B` | 지갑아이디_기본 | WAET_ID, MBR_ID, PTCPT_SE_CD |
| `MV_SCM_CMMN_CD` | 공통코드 | CMMN_GROUP_CD, CMMN_CD, CMMN_CD_NM |
| `__comm_code_map` | 코드맵 (내부) | table_name, column_name, column_value, korea_term, synonyms (85행) |

**테이블/컬럼 코멘트 조회:**
```sql
SELECT table_name, comment FROM duckdb_tables();
SELECT column_name, data_type, comment FROM duckdb_columns() WHERE table_name='fcs_frcs_b';
```

---

## 17. 알려진 제약 및 주의사항

| 항목 | 내용 |
|---|---|
| 임베딩 | `OPENAI_API_KEY` 없으면 ONNX 384차원 폴백. 기존 3072차원 벡터와 혼용 불가 — 재인덱스 필요 |
| LLM 속도 | GCP VM 모델 특성상 TTFT 수십 초. `stream=True` 적용으로 첫 토큰 체감 속도 개선 |
| Knowledge RAG | 현재 docs[0] 1개, 150자만 사용 (모델 프롬프트 길이 민감성으로 제한) |
| SQL Agent 캐시 | 스키마·코드맵은 에이전트 인스턴스 수명 동안 캐시 — 스키마 변경 시 서버 재시작 필요 |
| `code_aliases` 테이블 | admin_meta.duckdb에 존재하나 SQL 에이전트 미사용 (추후 확장용) |
| GCP LLM 시작 | `agent-connect-llm`은 반드시 **루트 디렉토리**에서 시작해야 함 |
