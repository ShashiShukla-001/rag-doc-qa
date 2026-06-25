import chromadb
from langchain_community.embeddings import SentenceTransformerEmbeddings
from langchain_community.vectorstores import Chroma

COLLECTION_NAME = "rag_docs"
_vectorstore = None


def get_vectorstore() -> Chroma:
    global _vectorstore
    if _vectorstore is None:
        embedding_model = SentenceTransformerEmbeddings(
            model_name="all-MiniLM-L6-v2"
        )
        client = chromadb.HttpClient(host="chromadb", port=8000)
        _vectorstore = Chroma(
            collection_name=COLLECTION_NAME,
            embedding_function=embedding_model,
            client=client,
        )
    return _vectorstore


def reset_vectorstore() -> None:
    """Remove all ingested chunks so a new upload does not mix with old PDFs."""
    global _vectorstore
    client = chromadb.HttpClient(host="chromadb", port=8000)
    try:
        client.delete_collection(COLLECTION_NAME)
    except Exception:
        pass
    _vectorstore = None
