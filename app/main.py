from fastapi import FastAPI, UploadFile, File, HTTPException
from pydantic import BaseModel
import asyncio
import shutil
from ingest import load_and_split, embed_and_store
from rag_chain import answer_question
from vectorstore import get_vectorstore
from contextlib import asynccontextmanager


@asynccontextmanager
async def lifespan(app: FastAPI):
    get_vectorstore()
    yield


app = FastAPI(lifespan=lifespan)


class QuestionRequest(BaseModel):
    question: str
    filename: str | None = None


@app.post("/ingest")
async def ingest_pdf(file: UploadFile = File(...)):
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are supported.")

    file_path = f"/app/docs/{file.filename}"

    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    try:
        chunks = await asyncio.to_thread(load_and_split, file_path)
        await asyncio.to_thread(embed_and_store, chunks)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    return {"message": f"Ingested {len(chunks)} chunks from {file.filename}"}


@app.post("/ask")
async def ask_question(request: QuestionRequest):
    if not request.filename:
        raise HTTPException(
            status_code=400,
            detail="No document selected. Upload a PDF first.",
        )

    result = await asyncio.to_thread(
        answer_question,
        request.question,
        request.filename,
    )
    return {
        "answer": result["result"],
        "sources": result["source_documents"],
    }
