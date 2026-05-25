"""
문서 수집(Ingestion) 파이프라인
사용법: python ingest_documents.py --source ./docs --pattern "*.pdf,*.docx,*.txt"
"""
import os
import sys
import argparse
import glob
from pathlib import Path
from dotenv import load_dotenv

load_dotenv(Path(__file__).parent.parent / ".env")

CHROMA_PATH = os.getenv("CHROMA_PATH", "./resources")
EMBEDDING_MODEL = os.getenv(
    "EMBEDDING_MODEL",
    "sentence-transformers/paraphrase-multilingual-mpnet-base-v2",
)


def ingest(source_dir: str, patterns: list[str], chunk_size: int = 500, overlap: int = 50):
    """Load documents, chunk, embed, and store in ChromaDB."""
    from langchain_community.document_loaders import (
        PyPDFLoader, TextLoader, UnstructuredWordDocumentLoader,
    )
    from langchain.text_splitter import RecursiveCharacterTextSplitter
    from langchain_community.vectorstores import Chroma
    from langchain_community.embeddings import HuggingFaceEmbeddings
    import chromadb

    print(f"[*] 소스 디렉토리: {source_dir}")
    print(f"[*] ChromaDB 경로: {CHROMA_PATH}")
    print(f"[*] 임베딩 모델: {EMBEDDING_MODEL}")

    documents = []
    for pattern in patterns:
        for filepath in glob.glob(os.path.join(source_dir, "**", pattern), recursive=True):
            ext = Path(filepath).suffix.lower()
            try:
                if ext == ".pdf":
                    loader = PyPDFLoader(filepath)
                elif ext in (".docx", ".doc"):
                    loader = UnstructuredWordDocumentLoader(filepath)
                else:
                    loader = TextLoader(filepath, encoding="utf-8")
                docs = loader.load()
                documents.extend(docs)
                print(f"  로드됨: {filepath} ({len(docs)}개 청크)")
            except Exception as e:
                print(f"  [!] 로드 실패: {filepath} — {e}")

    if not documents:
        print("[!] 로드된 문서가 없습니다.")
        return

    splitter = RecursiveCharacterTextSplitter(
        chunk_size=chunk_size, chunk_overlap=overlap
    )
    chunks = splitter.split_documents(documents)
    print(f"\n[*] 총 {len(chunks)}개 청크 생성됨")

    embeddings = HuggingFaceEmbeddings(model_name=EMBEDDING_MODEL)
    client = chromadb.PersistentClient(path=CHROMA_PATH)
    vectorstore = Chroma(client=client, embedding_function=embeddings)

    vectorstore.add_documents(chunks)
    print(f"[+] ChromaDB에 {len(chunks)}개 청크 저장 완료!")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="문서 수집 파이프라인")
    parser.add_argument("--source", default="./docs", help="소스 디렉토리")
    parser.add_argument(
        "--pattern", default="*.pdf,*.docx,*.txt,*.md",
        help="파일 패턴 (콤마 구분)"
    )
    parser.add_argument("--chunk-size", type=int, default=500)
    parser.add_argument("--overlap", type=int, default=50)
    args = parser.parse_args()

    patterns = [p.strip() for p in args.pattern.split(",")]
    ingest(args.source, patterns, args.chunk_size, args.overlap)
