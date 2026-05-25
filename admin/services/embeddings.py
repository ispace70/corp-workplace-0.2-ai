"""임베딩 빌더 — OpenAI (3072차원) 또는 ONNX 폴백 (384차원)"""
import os
from typing import Callable, List, Tuple

from dotenv import load_dotenv

load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), "../../.env"))

OPENAI_API_KEY  = os.getenv("OPENAI_API_KEY", "")
EMBEDDING_MODEL = os.getenv("EMBEDDING_MODEL", "text-embedding-3-large")

_BATCH_SIZE = 50


def _openai_embed(texts: List[str]) -> List[List[float]]:
    import openai
    client = openai.OpenAI(api_key=OPENAI_API_KEY)
    results: List[List[float]] = []
    for i in range(0, len(texts), _BATCH_SIZE):
        batch = texts[i : i + _BATCH_SIZE]
        resp = client.embeddings.create(model=EMBEDDING_MODEL, input=batch)
        results.extend([item.embedding for item in resp.data])
    return results


def _onnx_embed(texts: List[str]) -> List[List[float]]:
    from chromadb.utils.embedding_functions import DefaultEmbeddingFunction
    ef = DefaultEmbeddingFunction()
    return ef(texts)  # type: ignore


def build_embeddings() -> Tuple[Callable[[List[str]], List[List[float]]], int]:
    """(embed_fn, dimension) 반환. OPENAI_API_KEY 있으면 OpenAI, 없으면 ONNX 폴백."""
    if OPENAI_API_KEY:
        try:
            import openai  # noqa: F401
            test = _openai_embed(["test"])
            dim = len(test[0])
            print(f"[Embeddings] OpenAI ({EMBEDDING_MODEL}, {dim}차원) 사용")
            return _openai_embed, dim
        except Exception as e:
            print(f"[WARNING] OpenAI 임베딩 초기화 실패: {e}")

    print("[WARNING] ONNX(384차원) 폴백 사용 — 기존 3072차원 벡터와 혼용 불가")
    return _onnx_embed, 384
