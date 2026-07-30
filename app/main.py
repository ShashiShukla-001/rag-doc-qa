from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
import asyncio
import json
import os
import shutil
from ingest import load_and_split, embed_and_store
from rag_chain import stream_answer
from vectorstore import get_vectorstore, list_documents, delete_by_filename
from contextlib import asynccontextmanager


DOCS_DIR = "/app/docs"


@asynccontextmanager
async def lifespan(app: FastAPI):
    get_vectorstore()
    yield


app = FastAPI(lifespan=lifespan)


class QuestionRequest(BaseModel):
    question: str
    filename: str | None = None


def _safe_pdf_name(filename: str | None) -> str:
    if not filename:
        raise HTTPException(status_code=400, detail="Filename is required.")
    name = os.path.basename(filename.strip())
    if not name.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are supported.")
    if name in ("", ".", ".."):
        raise HTTPException(status_code=400, detail="Invalid filename.")
    return name


@app.get("/documents")
async def get_documents():
    documents = await asyncio.to_thread(list_documents)
    return {"documents": documents}


@app.delete("/documents/{filename}")
async def remove_document(filename: str):
    name = _safe_pdf_name(filename)
    deleted = await asyncio.to_thread(delete_by_filename, name)

    file_path = os.path.join(DOCS_DIR, name)
    if os.path.isfile(file_path):
        os.remove(file_path)

    return {
        "message": f"Removed {name} ({deleted} chunks)",
        "filename": name,
        "chunks_deleted": deleted,
    }


@app.post("/ingest")
async def ingest_pdf(file: UploadFile = File(...)):
    name = _safe_pdf_name(file.filename)
    file_path = os.path.join(DOCS_DIR, name)

    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    try:
        chunks = await asyncio.to_thread(load_and_split, file_path)
        await asyncio.to_thread(embed_and_store, chunks)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    return {
        "message": f"Ingested {len(chunks)} chunks from {name}",
        "filename": name,
        "chunks": len(chunks),
    }


@app.post("/ask")
async def ask_question(request: QuestionRequest):
    if not request.filename:
        raise HTTPException(
            status_code=400,
            detail="No document selected. Upload a PDF first.",
        )

    filename = _safe_pdf_name(request.filename)

    async def event_stream():
        try:
            async for event in stream_answer(request.question, filename):
                yield f"data: {json.dumps(event)}\n\n"
        except Exception as exc:
            error_event = {"type": "error", "detail": str(exc)}
            yield f"data: {json.dumps(error_event)}\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
