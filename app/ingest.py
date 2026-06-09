import chromadb
from langchain_community.document_loaders import PyPDFLoader
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_community.embeddings import SentenceTransformerEmbeddings
from langchain_community.vectorstores import Chroma

def load_and_split(pdf_path: str):
    loader = PyPDFLoader(pdf_path)
    documents = loader.load()
    splitter = RecursiveCharacterTextSplitter(
        chunk_size=1000,
        chunk_overlap=200
    )
    chunks = splitter.split_documents(documents)
    return chunks

def embed_and_store(chunks):
    embedding_model = SentenceTransformerEmbeddings(
        model_name="all-MiniLM-L6-v2"
    )
    client = chromadb.HttpClient(
        host="chromadb",
        port=8000
    )
    vectorstore = Chroma.from_documents(
        documents=chunks,
        embedding=embedding_model,
        collection_name="rag_docs",
        client = client
    )
    return vectorstore