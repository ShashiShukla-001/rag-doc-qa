from langchain_ollama import OllamaLLM
from langchain.chains import RetrievalQA
from langchain.prompts import PromptTemplate
from vectorstore import get_vectorstore

QA_PROMPT = PromptTemplate(
    input_variables=["context", "question"],
    template=(
        "You are answering questions using only the document excerpts below.\n"
        "Answer from the context. Reasonable inferences are allowed "
        "(e.g. highest qualification from the education section).\n"
        "If the question is about chat history or information not in the document, "
        "say you can only answer from the uploaded PDF.\n"
        "If the context does not contain enough information, say you don't know.\n"
        "IMPORTANT — pronouns: Never use he/him/his or she/her/hers in your answer "
        "unless those exact pronouns appear in the document excerpts. "
        "Refer to the person by their name from the document, or use they/them. "
        "This applies even if the question uses gendered pronouns.\n\n"
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


def answer_question(question: str, filename: str | None = None):
    vectorstore = get_vectorstore()
    search_kwargs = {"k": 5}
    if filename:
        search_kwargs["filter"] = {"filename": filename}

    retriever = vectorstore.as_retriever(search_kwargs=search_kwargs)
    chain = RetrievalQA.from_chain_type(
        llm=_get_llm(),
        retriever=retriever,
        return_source_documents=True,
        chain_type_kwargs={"prompt": QA_PROMPT},
    )
    return chain.invoke({"query": question})
