# RAG Document Q&A

A fully local Retrieval-Augmented Generation (RAG) system that lets you upload any PDF and ask questions about it. Built with FastAPI, LangChain, ChromaDB, and Ollama — runs entirely in Docker with no cloud dependencies.

---

## What problem does this solve?

LLMs like llama3 have two core limitations:
- **Hallucination** — they generate confident but incorrect answers
- **Knowledge cutoff** — they don't know about your private documents

RAG solves both by grounding the LLM in real retrieved content before it generates an answer. The model only answers based on what's actually in your documents.

---

## Architecture

```
INGEST FLOW (once per document)
PDF → chunk (1000 chars, 200 overlap) → embed (all-MiniLM-L6-v2) → ChromaDB

QUERY FLOW (every question)
Question → embed → vector search (top-3 chunks) → build prompt → llama3 → answer + sources
```

---

## Tech stack

| Component | Technology | Why |
|---|---|---|
| API server | FastAPI | Async, auto-docs at /docs |
| RAG framework | LangChain | Chains retrieval + LLM in one call |
| Vector store | ChromaDB | Built for similarity search, not keyword match |
| Embedding model | all-MiniLM-L6-v2 | Lightweight, local, no API key needed |
| LLM | llama3 via Ollama | Fully local, no OpenAI costs |
| Containerization | Docker Compose | One command setup, nothing on host machine |

---

## Running locally

**Prerequisites:** Docker Desktop

```bash
git clone https://github.com/ShashiShukla-001/rag-doc-qa.git
cd rag-doc-qa
docker compose up --build
```

Then pull the LLM model (one-time, ~4GB):
```bash
docker exec -it rag-doc-qa-ollama-1 ollama pull llama3
```

API is live at `http://localhost:8080`
Interactive docs at `http://localhost:8080/docs`

---

## API usage

### Ingest a PDF
```bash
curl -X POST http://localhost:8080/ingest \
  -F "file=@your_document.pdf"
```

Response:
```json
{ "message": "Ingested 47 chunks from your_document.pdf" }
```

### Ask a question
```bash
curl -X POST http://localhost:8080/ask \
  -H "Content-Type: application/json" \
  -d '{"question": "What is the main argument of this document?"}'
```

Response:
```json
{
  "answer": "...",
  "sources": [
    {
      "metadata": { "source": "/app/docs/file.pdf", "page": 3 },
      "page_content": "..."
    }
  ]
}
```

---

## Services

| Service | Port | Purpose |
|---|---|---|
| FastAPI app | 8080 | REST API endpoints |
| ChromaDB | 8000 | Vector storage |
| Ollama | 11434 | Local LLM runtime |

---

## What I learned

- **RAG architecture** — how to split the ingest and query flows, and why they must be separate
- **Vector embeddings** — why text similarity search needs vectors instead of keywords
- **LangChain chains** — how RetrievalQA connects a retriever and LLM into a single callable
- **Docker networking** — how containers communicate using service names as hostnames
- **Layer caching** — why `requirements.txt` is copied before app code in the Dockerfile

---

## Project structure

```
rag-doc-qa/
├── docker-compose.yml
├── app/
│   ├── Dockerfile
│   ├── requirements.txt
│   ├── main.py          # FastAPI endpoints
│   ├── ingest.py        # PDF → chunks → ChromaDB
│   └── rag_chain.py     # Question → retriever → LLM → answer
└── docs/                # Drop PDFs here
```