"""GCP LLM 동기 래퍼 — 프롬프트 테스트 / 미리보기용"""
import os
import json
from typing import Iterator, List, Dict, Optional

import requests
from dotenv import load_dotenv

load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), "../../.env"))

_LLM_URL  = os.getenv("GCP_LLM_URL", "http://localhost:8001")
_TIMEOUT  = (10, 120)


def _extract_text(obj: dict) -> str:
    for key in ("chunk", "content", "message", "text", "response", "answer", "output"):
        if isinstance(obj.get(key), str):
            return obj[key]
    for choice in obj.get("choices", []):
        for sub in (choice.get("delta", {}), choice.get("message", {})):
            if isinstance(sub.get("content"), str):
                return sub["content"]
    return ""


def stream_llm(messages: List[Dict], system: str = "") -> Iterator[str]:
    """GCP LLM SSE 스트리밍 — Streamlit st.write_stream() 용."""
    payload_msgs: List[Dict] = []
    if system:
        payload_msgs.append({"role": "system", "content": system})
    payload_msgs.extend(messages)

    body = {"messages": payload_msgs, "provider": "gcp_vm", "stream": True}
    try:
        with requests.post(
            f"{_LLM_URL}/chat",
            json=body,
            headers={"Content-Type": "application/json"},
            stream=True,
            timeout=_TIMEOUT,
        ) as resp:
            resp.raise_for_status()
            detected: Optional[str] = None
            for raw in resp.iter_lines():
                if not raw:
                    continue
                line = raw.decode("utf-8", errors="replace").strip()
                if detected is None:
                    detected = "sse" if line.startswith("data:") else "ndjson"
                if detected == "sse":
                    if not line.startswith("data:"):
                        continue
                    data = line[5:].strip()
                    if data in ("[DONE]", ""):
                        break
                    try:
                        text = _extract_text(json.loads(data))
                        if text:
                            yield text
                    except json.JSONDecodeError:
                        if data:
                            yield data
                else:
                    try:
                        text = _extract_text(json.loads(line))
                        if text:
                            yield text
                    except json.JSONDecodeError:
                        yield line
    except Exception as e:
        yield f"\n[LLM 연결 오류: {e}]"


def call_llm(prompt: str, system: str = "") -> str:
    """단순 동기 호출 — 전체 응답 반환."""
    return "".join(stream_llm([{"role": "user", "content": prompt}], system=system))
