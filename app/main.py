from fastapi import FastAPI, UploadFile, File
from pydantic import BaseModel
import os
import shutil
from ingest import load_and_split, embed_and_store
from rag_chain import get_rag_chain
from contextlib import asynccontextmanager

app = FastAPI()

chain = None

@asynccontextmanager
async def lifespan(app: FastAPI):
    global chain
    chain = get_rag_chain()
    yield

app = FastAPI(lifespan=lifespan)

class QuestionRequest(BaseModel):
    question: str

@app.post("/ingest")
async def ingest_pdf(file: UploadFile = File(...)):
    file_path = f"/app/docs/{file.filename}"
    
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
    
    chunks = load_and_split(file_path)
    embed_and_store(chunks)
    
    return {"message": f"Ingested {len(chunks)} chunks from {file.filename}"}

@app.post("/ask")
async def ask_question(request: QuestionRequest):
    result = chain.invoke({"query": request.question})
    return {
        "answer": result["result"],
        "sources": result["source_documents"]
    }