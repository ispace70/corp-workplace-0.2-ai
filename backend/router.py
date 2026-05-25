"""FastAPI router: /chat, /sql/execute, /db/tables, /health"""
import json
import os
import asyncio
from typing import Optional, AsyncIterator

from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from agents.knowledge_agent import KnowledgeAgent
from agents.sql_agent import SQLAgent, get_tables, execute_raw_sql
from agents.llm_client import GCPChatLLM, stream_text_direct

api_router = APIRouter()

# ---------------------------------------------------------------------------
# Lazy singletons
# ---------------------------------------------------------------------------

_knowledge_agent: Optional[KnowledgeAgent] = None
_sql_agent: Optional[SQLAgent] = None
_llm: Optional[GCPChatLLM] = None


def _get_knowledge_agent() -> KnowledgeAgent:
    global _knowledge_agent
    if _knowledge_agent is None:
        _knowledge_agent = KnowledgeAgent()
    return _knowledge_agent


def _get_sql_agent() -> SQLAgent:
    global _sql_agent
    if _sql_agent is None:
        _sql_agent = SQLAgent()
    return _sql_agent


def _get_llm() -> GCPChatLLM:
    global _llm
    if _llm is None:
        _llm = GCPChatLLM()
    return _llm


# ---------------------------------------------------------------------------
# Request/Response models
# ---------------------------------------------------------------------------

class ChatRequest(BaseModel):
    message: str
    mode: str = "auto"          # "auto" | "knowledge" | "sql"
    session_id: str = "default"


class SqlExecuteRequest(BaseModel):
    sql: str
    query: str = ""             # original NL query for answer generation
    session_id: str = "default"


# ---------------------------------------------------------------------------
# LLM-based router
# ---------------------------------------------------------------------------

ROUTER_PROMPT = """사용자의 질문을 분석하여 아래 세 가지 중 하나로 분류하세요.
반드시 단어 하나만 출력하세요.

- knowledge : 사내 문서, 정책, 규정, 매뉴얼 등 지식 검색이 필요한 경우
- sql : 데이터 조회, 통계, 분석, 수치 등 DB 쿼리가 필요한 경우
- general : 일반적인 대화, 코딩 질문, 인터넷 지식 등"""


async def _classify_query(query: str) -> str:
    def _sync():
        from langchain_core.messages import SystemMessage, HumanMessage
        resp = _get_llm().invoke([
            SystemMessage(content=ROUTER_PROMPT),
            HumanMessage(content=query),
        ])
        text = resp.content.strip().lower()
        for label in ("knowledge", "sql", "general"):
            if label in text:
                return label
        return "general"
    return await asyncio.to_thread(_sync)


# ---------------------------------------------------------------------------
# SSE helpers
# ---------------------------------------------------------------------------

def _sse(event: dict) -> str:
    return f"data: {json.dumps(event, ensure_ascii=False)}\n\n"


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@api_router.get("/health")
async def health():
    return {"status": "ok", "version": "1.0.0"}


@api_router.get("/db/tables")
async def db_tables():
    return {"tables": get_tables()}


async def _heartbeat_wrap(gen: AsyncIterator) -> AsyncIterator:
    """LLM 응답 대기 중 15초마다 SSE 하트비트를 보내 연결을 유지한다."""
    it = gen.__aiter__()
    pending = asyncio.ensure_future(it.__anext__())
    try:
        while True:
            done, _ = await asyncio.wait({pending}, timeout=15)
            if done:
                try:
                    yield done.pop().result()
                    pending = asyncio.ensure_future(it.__anext__())
                except StopAsyncIteration:
                    break
            else:
                yield ": heartbeat\n\n"   # SSE comment — 브라우저에 보이지 않음
    finally:
        pending.cancel()


@api_router.post("/chat")
async def chat(req: ChatRequest):
    async def _events() -> AsyncIterator[str]:
        mode = req.mode

        if mode == "auto":
            route = await _classify_query(req.message)
        else:
            route = mode

        if mode == "auto":
            yield _sse({"type": "route", "content": route})

        if route == "knowledge":
            agent = _get_knowledge_agent()
            async for event in agent.astream(req.message):
                yield _sse(event)

        elif route == "sql":
            agent = _get_sql_agent()
            async for event in agent.astream(req.message):
                yield _sse(event)

        else:
            yield _sse({"type": "route", "content": "general"})
            async for chunk in stream_text_direct(req.message):
                yield _sse({"type": "text", "content": chunk})

        yield "data: [DONE]\n\n"

    return StreamingResponse(
        _heartbeat_wrap(_events()),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@api_router.post("/sql/execute")
async def sql_execute(req: SqlExecuteRequest):
    async def generate():
        agent = _get_sql_agent()
        async for event in agent.astream_execute(req.query, req.sql):
            yield _sse(event)
        yield "data: [DONE]\n\n"

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )
