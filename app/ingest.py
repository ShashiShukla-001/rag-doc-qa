import os
from langchain_community.document_loaders import PyPDFLoader
from langchain_text_splitters import RecursiveCharacterTextSplitter
from vectorstore import get_vectorstore, delete_by_filename

# Prefer splitting on chapter/section boundaries before falling back to paragraphs.
_SEPARATORS = [
    "\nChapter ",
    "\nCHAPTER ",
    "\nchapter ",
    "\n\n\n",
    "\n\n",
    "\n",
    ". ",
    " ",
    "",
]


def load_and_split(pdf_path: str):
    loader = PyPDFLoader(pdf_path)
    documents = loader.load()
    splitter = RecursiveCharacterTextSplitter(
        chunk_size=1000,
        chunk_overlap=200,
        separators=_SEPARATORS,
        is_separator_regex=False,
    )
    chunks = splitter.split_documents(documents)
    filename = os.path.basename(pdf_path)
    for chunk in chunks:
        chunk.metadata["filename"] = filename
    return chunks


def embed_and_store(chunks):
    if not chunks:
        raise ValueError("No text could be extracted from this PDF.")

    filename = chunks[0].metadata.get("filename")
    if filename:
        # Replace this PDF's previous chunks; leave other documents alone
        delete_by_filename(filename)

    vectorstore = get_vectorstore()
    vectorstore.add_documents(chunks)
    return vectorstore
