import chromadb
from langchain_community.embeddings import SentenceTransformerEmbeddings
from langchain_community.vectorstores import Chroma

COLLECTION_NAME = "rag_docs"
_vectorstore = None


def _client() -> chromadb.HttpClient:
    return chromadb.HttpClient(host="chromadb", port=8000)


def get_vectorstore() -> Chroma:
    global _vectorstore
    if _vectorstore is None:
        embedding_model = SentenceTransformerEmbeddings(
            model_name="all-MiniLM-L6-v2"
        )
        _vectorstore = Chroma(
            collection_name=COLLECTION_NAME,
            embedding_function=embedding_model,
            client=_client(),
        )
    return _vectorstore


def delete_by_filename(filename: str) -> int:
    """Remove chunks for one PDF so a re-upload can replace it."""
    vectorstore = get_vectorstore()
    collection = vectorstore._collection
    results = collection.get(where={"filename": filename}, include=[])
    ids = results.get("ids") or []
    if ids:
        collection.delete(ids=ids)
    return len(ids)


def list_documents() -> list[dict]:
    """Return unique filenames and chunk counts currently in Chroma."""
    vectorstore = get_vectorstore()
    collection = vectorstore._collection
    try:
        results = collection.get(include=["metadatas"])
    except Exception:
        return []

    counts: dict[str, int] = {}
    for meta in results.get("metadatas") or []:
        if not meta:
            continue
        name = meta.get("filename")
        if name:
            counts[name] = counts.get(name, 0) + 1

    return [
        {"filename": name, "chunks": count}
        for name, count in sorted(counts.items())
    ]


def get_documents_by_filename(filename: str) -> list:
    """Load all stored chunks for one PDF (for BM25 / chapter expansion)."""
    from langchain_core.documents import Document

    vectorstore = get_vectorstore()
    collection = vectorstore._collection
    try:
        results = collection.get(
            where={"filename": filename},
            include=["documents", "metadatas"],
        )
    except Exception:
        return []

    docs = []
    ids = results.get("ids") or []
    texts = results.get("documents") or []
    metas = results.get("metadatas") or []
    for i, text in enumerate(texts):
        meta = dict(metas[i] or {})
        meta["_id"] = ids[i] if i < len(ids) else f"{filename}-{i}"
        docs.append(Document(page_content=text, metadata=meta))
    return docs
