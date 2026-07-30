import re
from langchain_core.documents import Document
from langchain_community.retrievers import BM25Retriever
from vectorstore import get_vectorstore, get_documents_by_filename

# Retrieval sizes
DEFAULT_K = 8
SUMMARY_K = 12
FINAL_K = 10
SUMMARY_FINAL_K = 16
CHAPTER_MAX_CHUNKS = 18
RRF_K = 60

_WORD_TO_NUM = {
    "first": 1,
    "1st": 1,
    "one": 1,
    "second": 2,
    "2nd": 2,
    "two": 2,
    "third": 3,
    "3rd": 3,
    "three": 3,
    "fourth": 4,
    "4th": 4,
    "four": 4,
    "fifth": 5,
    "5th": 5,
    "five": 5,
    "sixth": 6,
    "6th": 6,
    "six": 6,
    "seventh": 7,
    "7th": 7,
    "seven": 7,
    "eighth": 8,
    "8th": 8,
    "eight": 8,
    "ninth": 9,
    "9th": 9,
    "nine": 9,
    "tenth": 10,
    "10th": 10,
    "ten": 10,
    "eleventh": 11,
    "11th": 11,
    "eleven": 11,
    "twelfth": 12,
    "12th": 12,
    "twelve": 12,
}

_ROMAN_TO_NUM = {
    "i": 1,
    "ii": 2,
    "iii": 3,
    "iv": 4,
    "v": 5,
    "vi": 6,
    "vii": 7,
    "viii": 8,
    "ix": 9,
    "x": 10,
    "xi": 11,
    "xii": 12,
}

_CHAPTER_QUERY_RE = re.compile(
    r"(?:"
    r"(?:the\s+)?(?P<ord>first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|"
    r"eleventh|twelfth|1st|2nd|3rd|4th|5th|6th|7th|8th|9th|10th|11th|12th)\s+chapter"
    r"|chapter\s+(?P<num>\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|"
    r"i{1,3}|iv|vi{0,3}|ix|xi{0,2}|x)"
    r")",
    re.IGNORECASE,
)

_CHAPTER_HEADING_RE = re.compile(
    r"(?:^|\n)\s*chapter\s+(?P<num>\d+|one|two|three|four|five|six|seven|eight|nine|ten|"
    r"eleven|twelve|i{1,3}|iv|vi{0,3}|ix|xi{0,2}|x)\b",
    re.IGNORECASE,
)

_SUMMARY_RE = re.compile(
    r"\b(summar(?:y|ize|ise|ising|izing)|overview|key\s+points|main\s+points)\b",
    re.IGNORECASE,
)


def _parse_chapter_token(token: str) -> int | None:
    if token is None:
        return None
    raw = token.strip().lower()
    if raw.isdigit():
        return int(raw)
    if raw in _WORD_TO_NUM:
        return _WORD_TO_NUM[raw]
    if raw in _ROMAN_TO_NUM:
        return _ROMAN_TO_NUM[raw]
    return None


def detect_chapter_number(question: str) -> int | None:
    match = _CHAPTER_QUERY_RE.search(question or "")
    if not match:
        return None
    return _parse_chapter_token(match.group("ord") or match.group("num"))


def is_summary_query(question: str) -> bool:
    return bool(_SUMMARY_RE.search(question or ""))


def chapter_numbers_in_text(text: str) -> list[int]:
    found: list[int] = []
    for match in _CHAPTER_HEADING_RE.finditer(text or ""):
        num = _parse_chapter_token(match.group("num"))
        if num is not None:
            found.append(num)
    return found


def _doc_key(doc: Document) -> str:
    meta = doc.metadata or {}
    if meta.get("_id"):
        return str(meta["_id"])
    page = meta.get("page", "")
    return f"{meta.get('filename', '')}|{page}|{hash(doc.page_content[:240])}"


def _sort_key(doc: Document):
    page = doc.metadata.get("page", 10**9)
    if not isinstance(page, int):
        page = 10**9
    return (page, str(doc.metadata.get("_id", "")))


def _heading_near_start(text: str, chapter_n: int) -> bool:
    """True if a matching chapter heading appears in the first ~200 chars."""
    head = (text or "")[:240]
    return chapter_n in chapter_numbers_in_text(head)


def expand_chapter(
    all_docs: list[Document],
    chapter_n: int,
    max_chunks: int = CHAPTER_MAX_CHUNKS,
) -> list[Document]:
    """Collect chunks from the chapter heading until the next chapter (or cap)."""
    if not all_docs:
        return []

    sorted_docs = sorted(all_docs, key=_sort_key)
    start_idx = None

    # Prefer a heading near the start of a chunk (real chapter openers)
    for i, doc in enumerate(sorted_docs):
        nums = chapter_numbers_in_text(doc.page_content)
        if chapter_n in nums and _heading_near_start(doc.page_content, chapter_n):
            start_idx = i
            break

    if start_idx is None:
        for i, doc in enumerate(sorted_docs):
            if chapter_n in chapter_numbers_in_text(doc.page_content):
                start_idx = i
                break

    if start_idx is None:
        return []

    collected: list[Document] = []
    for doc in sorted_docs[start_idx:]:
        nums = chapter_numbers_in_text(doc.page_content)
        later = [n for n in nums if n > chapter_n]
        if collected and later and _heading_near_start(doc.page_content, min(later)):
            break
        collected.append(doc)
        if len(collected) >= max_chunks:
            break
    return collected


def rrf_fuse(
    rankings: list[list[Document]],
    top_n: int,
    k: int = RRF_K,
) -> list[Document]:
    scores: dict[str, float] = {}
    by_key: dict[str, Document] = {}
    for ranking in rankings:
        for rank, doc in enumerate(ranking):
            key = _doc_key(doc)
            by_key[key] = doc
            scores[key] = scores.get(key, 0.0) + 1.0 / (k + rank + 1)
    ordered = sorted(scores.items(), key=lambda item: item[1], reverse=True)
    return [by_key[key] for key, _ in ordered[:top_n]]


def retrieve_documents(
    question: str,
    filename: str | None = None,
) -> list[Document]:
    """Hybrid (vector + BM25) retrieval with chapter-aware expansion when needed."""
    summary = is_summary_query(question)
    chapter_n = detect_chapter_number(question)
    vector_k = SUMMARY_K if (summary or chapter_n is not None) else DEFAULT_K
    final_k = SUMMARY_FINAL_K if (summary or chapter_n is not None) else FINAL_K

    vectorstore = get_vectorstore()

    if not filename:
        return vectorstore.similarity_search(question, k=final_k)

    all_docs = get_documents_by_filename(filename)
    if not all_docs:
        return []

    k = min(vector_k, len(all_docs))
    rankings: list[list[Document]] = []

    vector_hits = vectorstore.similarity_search(
        question,
        k=k,
        filter={"filename": filename},
    )
    rankings.append(vector_hits)

    bm25 = BM25Retriever.from_documents(all_docs)
    bm25.k = k
    rankings.append(bm25.invoke(question))

    chapter_docs: list[Document] = []
    if chapter_n is not None:
        chapter_docs = expand_chapter(all_docs, chapter_n)
        if chapter_docs:
            rankings.append(chapter_docs)

    fused = rrf_fuse(rankings, top_n=final_k)

    # For chapter summaries, prefer the expanded chapter body as primary context
    if chapter_n is not None and summary and len(chapter_docs) >= 2:
        keys = {_doc_key(doc) for doc in chapter_docs}
        extras = [doc for doc in fused if _doc_key(doc) not in keys][:4]
        combined = chapter_docs + extras
        return combined[: max(final_k, len(chapter_docs))]

    if chapter_n is not None and chapter_docs and len(fused) < 4:
        return chapter_docs[:final_k]

    return fused
