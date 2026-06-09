from langchain_community.embeddings import SentenceTransformerEmbeddings
from langchain_community.vectorstores import Chroma
from langchain_ollama import OllamaLLM
from langchain.chains import RetrievalQA
import chromadb

def get_rag_chain():
    embedding_model = SentenceTransformerEmbeddings(
        model_name="all-MiniLM-L6-v2"
    )
    
    client = chromadb.HttpClient(host="chromadb", port=8000)
    
    vectorstore = Chroma(
        collection_name="rag_docs",
        embedding_function=embedding_model,
        client=client
    )
    
    retriever = vectorstore.as_retriever(
        search_kwargs={"k": 3}
    )
    
    llm = OllamaLLM(
        model="llama3",
        base_url="http://ollama:11434"
    )
    
    chain = RetrievalQA.from_chain_type(
        llm=llm,
        retriever=retriever,
        return_source_documents=True
    )
    
    return chain