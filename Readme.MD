# RAG Document Q&A

A fully local Retrieval-Augmented Generation (RAG) system with a web UI. Upload multiple PDFs into a document library, select one, ask questions, and get **streamed** answers grounded in that document — with source citations showing exactly which chunks were used.

Built with **React**, **FastAPI**, **LangChain**, **ChromaDB**, and **Ollama**. Runs entirely in Docker. No cloud APIs, no API keys.

---

## Screenshots

<!-- SCREENSHOT: Main UI — library + upload on the left, empty chat on the right -->
<!-- Save as: docs/screenshots/01-main-ui.png -->
![Main UI — library and chat](docs/screenshots/01-main-ui.png)

<!-- SCREENSHOT: Several PDFs in the library; one selected as active -->
<!-- Save as: docs/screenshots/02-library.png -->
![Multi-document library](docs/screenshots/02-library.png)

<!-- SCREENSHOT: Chat with a streaming / completed answer and sources collapsed -->
<!-- Save as: docs/screenshots/03-chat-answer.png -->
![Streaming chat answer with sources](docs/screenshots/03-chat-answer.png)

<!-- SCREENSHOT: Expanded "sources used" panel showing chunk text and page numbers -->
<!-- Save as: docs/screenshots/04-sources-expanded.png -->
![Expanded source citations](docs/screenshots/04-sources-expanded.png)

---

## What problem does this solve?

LLMs like llama3 have two core limitations:

- **Hallucination** — they generate confident but incorrect answers
- **Knowledge cutoff** — they don't know about your private documents

RAG solves both by retrieving relevant chunks from your PDF *before* the LLM generates an answer. The model is instructed to answer from that context, and you can inspect the exact source chunks used.

---

## Features

- **Web UI** — drag-and-drop PDF upload and chat at `http://localhost:3000`
- **Multi-document library** — keep several PDFs at once; click to switch the active doc
- **Per-document chat history** — each PDF keeps its own conversation in the UI
- **Scoped retrieval** — every question searches only the selected document’s chunks
- **Safe re-upload** — uploading the same filename replaces that doc only; others stay
- **Delete from library** — remove a PDF’s chunks (and file) with one click
- **Streaming answers** — tokens appear as llama3 generates (SSE on `/ask`)
- **Sticky scroll** — chat follows new tokens only while you’re near the bottom; scroll up anytime during a stream without being yanked back
- **Hybrid retrieval** — vector search + BM25 keyword search, fused with Reciprocal Rank Fusion (RRF)
- **Chapter-aware answers** — “summarize chapter 1 / first chapter” expands to that chapter’s body chunks (not just the title)
- **Chapter-aware chunking** — ingest prefers split boundaries on `Chapter` / `CHAPTER` headings
- **Intent-aware prompting** — summaries must be multi-sentence; if context is incomplete, the model says what’s missing
- **Source citations** — expand “sources used” to see retrieved chunks and page numbers
- **Persistent vectors** — ChromaDB data survives container restarts (`chromadb_data` volume)
- **Fully local** — embeddings (`all-MiniLM-L6-v2`) and LLM (`llama3` via Ollama)
- **Docker Compose** — one command starts frontend, API, ChromaDB, and Ollama
- **REST API** — `/ingest`, `/documents`, and `/ask` for programmatic use

---

## Architecture

```
INGEST FLOW (per upload)
Browser → nginx (3000) → FastAPI /ingest → PDF
         → chunks (1000 chars, 200 overlap; prefer Chapter/CHAPTER splits)
         → embed (all-MiniLM-L6-v2) → ChromaDB
         (same filename: replace that doc’s chunks only; other docs untouched)

LIBRARY
GET  /documents          → list filenames + chunk counts
DELETE /documents/{name} → remove that doc’s chunks (+ PDF on disk)

QUERY FLOW (every question)
Browser → nginx (3000) → FastAPI /ask
         → hybrid retrieve (vector + BM25 → RRF; chapter expansion when asked)
         → prompt (answer the user’s intent) + llama3
         → SSE stream (sources → tokens → done)
```

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  Frontend   │────▶│  FastAPI    │────▶│  ChromaDB   │
│  React+Nginx│     │  app :8080  │     │  :8000      │
│  :3000      │     └──────┬──────┘     │  (persisted)│
└─────────────┘            │            └─────────────┘
                           ▼
                    ┌─────────────┐
                    │   Ollama    │
                    │  llama3     │
                    │  :11434     │
                    └─────────────┘
```

### How retrieval works

1. **Vector search** — embed the question; find semantically similar chunks in the active PDF  
2. **BM25** — keyword search over that PDF’s chunks (helps with exact titles, names, “Chapter 1”)  
3. **RRF fusion** — merge the two ranked lists into one result set  
4. **Chapter expansion** — if the question refers to a chapter (`first chapter`, `chapter 2`, `chapter iii`, …), find a matching `Chapter N` heading and pull consecutive chunks until the next chapter (or a size cap)  
5. **Higher `k` for summaries / chapters** — more context is sent to the LLM for those asks  

Chapter detection works best when the PDF text contains headings like `Chapter 1` or `CHAPTER 2`. Odd TOC-only formatting may still return thin context — expand **sources used** to inspect what was retrieved.

### How the prompt behaves

- Answer the **user’s intent** (a summary request must produce a real multi-sentence summary, not just a title)  
- Prefer concrete points from the excerpts  
- If excerpts are incomplete (e.g. only a chapter name), **say what’s missing** and answer only what the text supports  
- Stay grounded in the uploaded PDF; no chat-history inventing  

---

## Tech stack

| Layer | Technology | Role |
|---|---|---|
| Frontend | React + Vite | Library UI, upload, streaming chat, sticky scroll |
| Reverse proxy | nginx | Static files; proxies `/ingest`, `/documents`, `/ask` |
| API | FastAPI | Ingest, document library, streaming Q&A |
| RAG | LangChain + Ollama `astream` | Hybrid retrieve, then stream the answer |
| Vector store | ChromaDB | Similarity search; one collection, filtered by `filename` |
| Keyword search | BM25 (`rank_bm25`) | Exact terms / chapter titles the embedder may miss |
| Embeddings | `all-MiniLM-L6-v2` | Local sentence embeddings |
| LLM | llama3 via Ollama | Local text generation |
| Containers | Docker Compose | Multi-service orchestration + volumes |

---

## Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (Windows, macOS, or Linux)
- ~8 GB free disk space (llama3 model is ~4 GB)
- Enough RAM for Ollama + embeddings (8 GB+ recommended)

---

## Quick start

```bash
git clone https://github.com/ShashiShukla-001/rag-doc-qa.git
cd rag-doc-qa
docker compose up --build
```

Pull the LLM model (one-time, ~4 GB):

```bash
docker exec -it rag-doc-qa-ollama-1 ollama pull llama3
```

Open the app:

| URL | Purpose |
|---|---|
| http://localhost:3000 | Web UI (library + chat) |
| http://localhost:8080/docs | FastAPI interactive API docs |

**Usage:**

1. Upload one or more PDFs on the left (they appear in **Library**)
2. Select the document you want to query
3. Ask questions in the chat — answers stream token-by-token and cite sources
4. Try chapter asks, e.g. `summarize the first chapter of the book`
5. Scroll up during a long answer anytime; auto-follow resumes when you return to the bottom

### After code changes

Rebuild so containers pick up new code:

```bash
docker compose up --build -d
```

Then hard-refresh the browser (**Ctrl+Shift+R**) so the UI isn’t serving a cached bundle.

**Re-upload PDFs** after ingest/chunking changes (for example chapter-aware separators). Rebuild alone does not re-chunk documents already stored in Chroma.

---

## API usage

### Ingest a PDF

```bash
curl -X POST http://localhost:8080/ingest \
  -F "file=@your_document.pdf"
```

Response:

```json
{
  "message": "Ingested 47 chunks from your_document.pdf",
  "filename": "your_document.pdf",
  "chunks": 47
}
```

Re-uploading the same filename replaces that document’s chunks only; other PDFs stay in the library.

### List documents

```bash
curl http://localhost:8080/documents
```

```json
{
  "documents": [
    { "filename": "resume.pdf", "chunks": 12 },
    { "filename": "handbook.pdf", "chunks": 47 }
  ]
}
```

### Delete a document

```bash
curl -X DELETE http://localhost:8080/documents/your_document.pdf
```

```json
{
  "message": "Removed your_document.pdf (47 chunks)",
  "filename": "your_document.pdf",
  "chunks_deleted": 47
}
```

### Ask a question (SSE stream)

```bash
curl -N -X POST http://localhost:8080/ask \
  -H "Content-Type: application/json" \
  -d '{"question": "What is the main topic?", "filename": "your_document.pdf"}'
```

Chapter-style example:

```bash
curl -N -X POST http://localhost:8080/ask \
  -H "Content-Type: application/json" \
  -d '{"question": "Summarize the first chapter", "filename": "your_book.pdf"}'
```

Response is `text/event-stream`. Events arrive in order:

```
data: {"type":"sources","sources":[{"metadata":{"filename":"...","page":2},"page_content":"..."}]}

data: {"type":"token","content":"The"}

data: {"type":"token","content":" main"}

data: {"type":"done"}
```

| Event | Meaning |
|---|---|
| `sources` | Retrieved chunks used for the answer |
| `token` | Next piece of the LLM answer |
| `done` | Stream finished |
| `error` | Generation failed (`detail` has the message) |

> `filename` must match a document in the library. The web UI sends the selected library item automatically.

---

## Services

| Service | Port | Purpose |
|---|---|---|
| Frontend (nginx) | 3000 | Web UI + API proxy (`proxy_buffering off` for `/ask`) |
| FastAPI app | 8080 | REST API |
| ChromaDB | 8000 | Vector storage (`chromadb_data` volume) |
| Ollama | 11434 | Local LLM runtime (`ollama_data` volume) |

---

## Project structure

```
rag-doc-qa/
├── docker-compose.yml
├── app/
│   ├── Dockerfile
│   ├── requirements.txt
│   ├── main.py           # /ingest, /documents, /ask (SSE)
│   ├── ingest.py         # PDF → chapter-aware chunks → ChromaDB
│   ├── rag_chain.py      # Intent-aware prompt + stream llama3 tokens
│   ├── retrieve.py       # Hybrid (vector + BM25) + chapter expansion
│   └── vectorstore.py    # Chroma client, list/delete by filename
├── frontend/
│   ├── Dockerfile
│   ├── nginx.conf        # Proxies /ingest, /documents, /ask
│   └── src/
│       ├── App.jsx       # Library state + per-doc chat history
│       └── components/   # UploadPanel, ChatPanel (sticky scroll), ChatMessage
└── docs/
    └── screenshots/      # README screenshots go here
```

---

## What I learned

- **RAG architecture** — separate ingest and query flows; retrieval must happen before generation
- **Streaming UX** — SSE + unbuffered nginx makes local LLMs feel much faster
- **Sticky scroll** — don’t force `scrollIntoView` on every token; only follow when the user is near the bottom
- **Hybrid retrieval** — fuse dense embeddings with BM25; expand chapter queries by heading/page
- **Prompting vs retrieval** — a weak prompt + TOC-only chunks yields a title instead of a summary; fix both
- **Vector embeddings** — similarity search over meaning, not keywords
- **Multi-document isolation** — one Chroma collection, filter by `filename`; delete/replace per file
- **Persistence** — mount Chroma and Ollama volumes so library and models survive restarts
- **Docker networking** — containers talk via service names (`app`, `chromadb`, `ollama`)
- **Production frontend** — Vite build served by nginx with an API reverse proxy
