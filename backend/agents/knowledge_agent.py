"""Knowledge Agent: RAG pipeline with ChromaDB + LangGraph"""
import os
import importlib
from typing import AsyncIterator, TypedDict, List, Annotated
import operator

from langchain_core.documents import Document
from langchain_core.embeddings import Embeddings
from langchain_community.vectorstores import Chroma
from langgraph.graph import StateGraph, END
import chromadb
from chromadb.utils.embedding_functions import DefaultEmbeddingFunction

from .llm_client import stream_text_direct

CHROMA_PATH    = os.getenv("CHROMA_PATH_KNOWLEDGE") or os.getenv("CHROMA_PATH", "./resources")
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")
EMBEDDING_MODEL = os.getenv("EMBEDDING_MODEL", "text-embedding-3-large")

_PROMPT_TEMPLATE = "참고: {context}\n\n질문: {query}\n\n답변(한국어, 간략하게):"


# ── 임베딩 선택 ────────────────────────────────────────────────────────────

class _OpenAIEmbeddings(Embeddings):
    """langchain_openai.OpenAIEmbeddings 래퍼."""
    def __init__(self, api_key: str, model: str):
        from langchain_openai import OpenAIEmbeddings
        self._emb = OpenAIEmbeddings(api_key=api_key, model=model)

    def embed_documents(self, texts: List[str]) -> List[List[float]]:
        return self._emb.embed_documents(texts)

    def embed_query(self, text: str) -> List[float]:
        return self._emb.embed_query(text)


class _OnnxEmbeddings(Embeddings):
    """ChromaDB 내장 ONNX 모델 (384차원). 기존 벡터와 차원 불일치 시 사용 불가."""
    def __init__(self):
        self._ef = DefaultEmbeddingFunction()

    def embed_documents(self, texts: List[str]) -> List[List[float]]:
        return self._ef(texts)  # type: ignore

    def embed_query(self, text: str) -> List[float]:
        return self._ef([text])[0]  # type: ignore


def _build_embeddings() -> Embeddings:
    """우선순위: OpenAI API key → HuggingFace(torch 필요) → ONNX(384차원 폴백)"""
    if OPENAI_API_KEY:
        try:
            return _OpenAIEmbeddings(api_key=OPENAI_API_KEY, model=EMBEDDING_MODEL)
        except Exception as e:
            print(f"[WARNING] OpenAI embeddings 초기화 실패: {e}")

    if importlib.util.find_spec("torch") is not None:
        try:
            from langchain_community.embeddings import HuggingFaceEmbeddings
            return HuggingFaceEmbeddings(model_name=EMBEDDING_MODEL)
        except Exception as e:
            print(f"[WARNING] HuggingFace embeddings 실패: {e}")

    print("[WARNING] ONNX(384차원) 폴백 사용 — 기존 3072차원 벡터와 불일치할 수 있습니다.")
    return _OnnxEmbeddings()


# ── 컬렉션 자동 감지 ────────────────────────────────────────────────────────

def _find_collection_name(client: chromadb.ClientAPI) -> str:
    """저장된 컬렉션 이름을 자동 감지. 없으면 'langchain' 반환."""
    cols = client.list_collections()
    if not cols:
        return "langchain"
    # 문서가 가장 많은 컬렉션 선택
    best = max(cols, key=lambda c: c.count())
    name = best.name
    count = best.count()
    print(f"[ChromaDB] 컬렉션 감지: '{name}' (문서 {count}개)")
    return name


# ── LangGraph 상태 ─────────────────────────────────────────────────────────

class KnowledgeState(TypedDict):
    query: str
    documents: Annotated[List[Document], operator.add]
    sources: List[dict]


# ── Agent ──────────────────────────────────────────────────────────────────

class KnowledgeAgent:
    def __init__(self):
        self.embeddings = _build_embeddings()
        self._init_vectorstore()
        self._retriever = self._build_retriever()
        self._graph = self._build_graph()

    def _init_vectorstore(self):
        # CHROMA_PATH는 디렉토리 경로여야 함 (chroma.sqlite3 파일이 그 안에 생성됨)
        path = CHROMA_PATH
        if path.endswith(".sqlite3") or path.endswith(".db"):
            path = os.path.dirname(path) or "./resources"
            print(f"[WARNING] CHROMA_PATH가 파일 경로입니다. 디렉토리로 변경: {path}")

        client = chromadb.PersistentClient(path=path)
        collection_name = _find_collection_name(client)

        self.vectorstore = Chroma(
            client=client,
            collection_name=collection_name,
            embedding_function=self.embeddings,
        )

    def _build_retriever(self):
        return self.vectorstore.as_retriever(search_kwargs={"k": 5})

    def _build_graph(self):
        def retrieve_node(state: KnowledgeState) -> dict:
            try:
                docs = self._retriever.invoke(state["query"])
            except Exception as e:
                print(f"[ERROR] 검색 실패: {e}")
                docs = []
            sources = [
                {
                    "source": doc.metadata.get("source", doc.metadata.get("filename", "Unknown")),
                    "page": doc.metadata.get("page", ""),
                    "content": doc.page_content[:600],
                }
                for doc in docs
            ]
            return {"documents": docs, "sources": sources}

        graph = StateGraph(KnowledgeState)
        graph.add_node("retrieve", retrieve_node)
        graph.set_entry_point("retrieve")
        graph.add_edge("retrieve", END)
        return graph.compile()

    async def astream(self, query: str) -> AsyncIterator[dict]:
        yield {"type": "route", "content": "knowledge"}
        yield {"type": "text", "content": "📚 관련 문서를 검색하고 있습니다...\n\n"}

        state: KnowledgeState = {"query": query, "documents": [], "sources": []}
        result = await self._graph.ainvoke(state)

        docs: List[Document] = result.get("documents", [])
        sources: List[dict] = result.get("sources", [])

        if sources:
            yield {"type": "sources", "content": sources}
            yield {"type": "text", "content": f"🔍 **{len(docs)}개**의 관련 문서를 발견했습니다.\n\n---\n\n"}
        else:
            yield {"type": "text", "content": "⚠️ 관련 문서를 찾지 못했습니다. 일반적인 답변을 드리겠습니다.\n\n---\n\n"}

        top_docs = docs[:1]
        context = (
            top_docs[0].page_content[:150].replace("\n", " ")
            if top_docs else "관련 문서 없음"
        )

        full_prompt = _PROMPT_TEMPLATE.format(context=context, query=query)
        try:
            async for chunk in stream_text_direct(full_prompt):
                yield {"type": "text", "content": chunk}
        except Exception as e:
            yield {"type": "text", "content": f"\n\n[답변 생성 오류: {e}]"}
