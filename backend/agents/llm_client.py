"""GCP Local LLM — LangChain wrapper (stream=True 전용)

GCP LLM 서버는 항상 stream=True 로 호출하고
SSE / NDJSON / plain-JSON 응답을 자동 감지해 텍스트 청크를 yield 합니다.
"""
import json
import os
import asyncio
import threading
import requests
from typing import Any, Dict, Iterator, List, Optional, AsyncIterator
from langchain_core.language_models import BaseChatModel
from langchain_core.messages import (
    AIMessage, AIMessageChunk, BaseMessage,
    HumanMessage, SystemMessage,
)
from langchain_core.outputs import ChatGeneration, ChatGenerationChunk, ChatResult
from langchain_core.callbacks import CallbackManagerForLLMRun, AsyncCallbackManagerForLLMRun

GCP_LLM_URL = os.getenv("GCP_LLM_URL", "http://localhost:8001")
GCP_PROVIDER = "gcp_vm"

# 연결 10 초, 첫 토큰(읽기) 600 초 대기
_TIMEOUT = (10, 600)


# ── 공통 유틸 ──────────────────────────────────────────────────────────────

def _to_payload(messages: List[BaseMessage]) -> List[Dict]:
    role_map = {HumanMessage: "user", AIMessage: "assistant", SystemMessage: "system"}
    return [
        {"role": role_map.get(type(m), "user"), "content": str(m.content)}
        for m in messages
    ]


def _extract_text(obj: dict) -> str:
    """다양한 JSON 키에서 텍스트 추출."""
    for key in ("chunk", "content", "message", "text", "response", "answer", "output"):
        if isinstance(obj.get(key), str):
            return obj[key]
    # OpenAI 호환 choices 배열
    for choice in obj.get("choices", []):
        for sub in (choice.get("delta", {}), choice.get("message", {})):
            if isinstance(sub.get("content"), str):
                return sub["content"]
    return ""


def _stream_raw(payload: List[Dict]) -> Iterator[str]:
    """GCP LLM 호출 → stream=True, SSE/NDJSON 라인 단위 yield."""
    body = {"messages": payload, "provider": GCP_PROVIDER, "stream": True}
    with requests.post(
        f"{GCP_LLM_URL}/chat",
        json=body,
        headers={"Content-Type": "application/json"},
        timeout=_TIMEOUT,
        stream=True,
    ) as resp:
        resp.raise_for_status()
        for line in resp.iter_lines():
            if not line:
                continue
            decoded = line.decode("utf-8") if isinstance(line, bytes) else line
            if decoded.startswith("data: "):
                decoded = decoded[6:]
            if decoded in ("[DONE]", ""):
                continue
            try:
                text = _extract_text(json.loads(decoded))
                if text:
                    yield text
            except json.JSONDecodeError:
                if decoded.strip():
                    yield decoded


def _call_llm(messages: List[Dict]) -> str:
    """GCP LLM 호출 → 전체 텍스트 반환 (스트리밍 청크 수집)."""
    return "".join(_stream_raw(messages))


def _stream_raw_from_dicts(messages: List[Dict]) -> Iterator[str]:
    """dict 메시지 목록으로 직접 호출 (stream_text_direct 용)."""
    yield from _stream_raw(messages)


# ── LangChain ChatModel ────────────────────────────────────────────────────

class GCPChatLLM(BaseChatModel):
    """LangChain ChatModel — GCP LLM stream=True 전용."""

    base_url: str = GCP_LLM_URL
    provider: str = GCP_PROVIDER

    @property
    def _llm_type(self) -> str:
        return "gcp_chat"

    def _generate(
        self,
        messages: List[BaseMessage],
        _stop: Optional[List[str]] = None,
        _run_manager: Optional[CallbackManagerForLLMRun] = None,
        **kwargs: Any,
    ) -> ChatResult:
        content = "".join(_stream_raw(_to_payload(messages)))
        return ChatResult(generations=[ChatGeneration(message=AIMessage(content=content))])

    def _stream(
        self,
        messages: List[BaseMessage],
        _stop: Optional[List[str]] = None,
        run_manager: Optional[CallbackManagerForLLMRun] = None,
        **kwargs: Any,
    ) -> Iterator[ChatGenerationChunk]:
        for text in _stream_raw(_to_payload(messages)):
            chunk = ChatGenerationChunk(message=AIMessageChunk(content=text))
            if run_manager:
                run_manager.on_llm_new_token(text)
            yield chunk

    async def _astream(
        self,
        messages: List[BaseMessage],
        _stop: Optional[List[str]] = None,
        run_manager: Optional[AsyncCallbackManagerForLLMRun] = None,
        **kwargs: Any,
    ) -> AsyncIterator[ChatGenerationChunk]:
        loop = asyncio.get_running_loop()
        queue: asyncio.Queue = asyncio.Queue()

        def _producer():
            try:
                for text in _stream_raw(_to_payload(messages)):
                    asyncio.run_coroutine_threadsafe(queue.put(text), loop).result()
            except Exception as e:
                asyncio.run_coroutine_threadsafe(queue.put(f"[오류: {e}]"), loop).result()
            finally:
                asyncio.run_coroutine_threadsafe(queue.put(None), loop).result()

        threading.Thread(target=_producer, daemon=True).start()

        while True:
            text = await queue.get()
            if text is None:
                break
            chunk = ChatGenerationChunk(message=AIMessageChunk(content=text))
            if run_manager:
                await run_manager.on_llm_new_token(text)
            yield chunk


# ── 사용자 응답 직접 스트리밍 ──────────────────────────────────────────────

async def stream_text_direct(prompt: str, system: str = "") -> AsyncIterator[str]:
    """FastAPI SSE 응답용 직접 스트리밍 — LangChain 오버헤드 없음."""
    msgs: List[Dict] = []
    if system:
        msgs.append({"role": "system", "content": system})
    msgs.append({"role": "user", "content": prompt})

    loop = asyncio.get_running_loop()
    queue: asyncio.Queue = asyncio.Queue()

    def _producer():
        try:
            for text in _stream_raw_from_dicts(msgs):
                asyncio.run_coroutine_threadsafe(queue.put(text), loop).result()
        except Exception as e:
            asyncio.run_coroutine_threadsafe(queue.put(f"\n[LLM 오류: {e}]"), loop).result()
        finally:
            asyncio.run_coroutine_threadsafe(queue.put(None), loop).result()

    threading.Thread(target=_producer, daemon=True).start()

    while True:
        item = await queue.get()
        if item is None:
            break
        yield item
