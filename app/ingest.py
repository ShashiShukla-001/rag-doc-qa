import os
from langchain_community.document_loaders import PyPDFLoader
from langchain_text_splitters import RecursiveCharacterTextSplitter
from vectorstore import get_vectorstore, reset_vectorstore


def load_and_split(pdf_path: str):
    loader = PyPDFLoader(pdf_path)
    documents = loader.load()
    splitter = RecursiveCharacterTextSplitter(
        chunk_size=1000,
        chunk_overlap=200,
    )
    chunks = splitter.split_documents(documents)
    filename = os.path.basename(pdf_path)
    for chunk in chunks:
        chunk.metadata["filename"] = filename
    return chunks


def embed_and_store(chunks):
    if not chunks:
        raise ValueError("No text could be extracted from this PDF.")

    reset_vectorstore()
    vectorstore = get_vectorstore()
    vectorstore.add_documents(chunks)
    return vectorstore
