import asyncio
from collections.abc import AsyncIterator

from langchain_ollama import OllamaLLM
from langchain.prompts import PromptTemplate
from retrieve import retrieve_documents

QA_PROMPT = PromptTemplate(
    input_variables=["context", "question"],
    template=(
        "You are a careful document Q&A assistant. Use ONLY the excerpts below.\n\n"
        "Rules:\n"
        "1. Fully answer the user's intent. If they ask to summarize, write a clear "
        "multi-sentence summary of the main ideas from the excerpts — not just a "
        "title, heading, or chapter name.\n"
        "2. Use concrete details from the excerpts. Prefer key points over vague "
        "one-liners.\n"
        "3. If the excerpts are incomplete for a full answer (for example only a "
        "chapter title without body text), say what is missing and answer only what "
        "the excerpts actually support.\n"
        "4. Reasonable inferences from the excerpts are allowed "
        "(e.g. highest qualification from an education section).\n"
        "5. If the question is about chat history or information not in the document, "
        "say you can only answer from the uploaded PDF.\n"
        "6. Pronouns: Never use he/him/his or she/her/hers unless those exact pronouns "
        "appear in the excerpts. Use the person's name from the document, or they/them.\n\n"
        "Context:\n{context}\n\n"
        "Question: {question}\n\n"
        "Answer:"
    ),
)

_llm = None


def _get_llm() -> OllamaLLM:
    global _llm
    if _llm is None:
        _llm = OllamaLLM(
            model="llama3",
            base_url="http://ollama:11434",
        )
    return _llm


def _serialize_sources(documents) -> list[dict]:
    sources = []
    for doc in documents:
        meta = {
            key: value
            for key, value in (doc.metadata or {}).items()
            if not str(key).startswith("_")
        }
        sources.append({"metadata": meta, "page_content": doc.page_content})
    return sources


def _format_context(documents) -> str:
    parts = []
    for i, doc in enumerate(documents, 1):
        page = doc.metadata.get("page")
        page_label = f"p.{page + 1}" if isinstance(page, int) else "unknown page"
        parts.append(f"[Excerpt {i} | {page_label}]\n{doc.page_content}")
    return "\n\n".join(parts)


def _chunk_text(chunk) -> str:
    if isinstance(chunk, str):
        return chunk
    text = getattr(chunk, "content", None)
    if text:
        return text
    return getattr(chunk, "text", "") or ""


async def stream_answer(
    question: str,
    filename: str | None = None,
) -> AsyncIterator[dict]:
    """Yield SSE-ready events: sources → token* → done."""
    documents = await asyncio.to_thread(retrieve_documents, question, filename)
    yield {"type": "sources", "sources": _serialize_sources(documents)}

    prompt = QA_PROMPT.format(
        context=_format_context(documents),
        question=question,
    )
    async for chunk in _get_llm().astream(prompt):
        text = _chunk_text(chunk)
        if text:
            yield {"type": "token", "content": text}

    yield {"type": "done"}
