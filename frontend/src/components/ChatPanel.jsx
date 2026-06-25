import React, { useState, useRef, useEffect } from 'react';
import ChatMessage from './ChatMessage';
import styles from './ChatPanel.module.css';

/**
 * ChatPanel
 * ---------
 * The right-side conversation area.
 *
 * Props:
 *  - currentDoc : string | null — name of the loaded PDF (used in placeholder)
 *
 * State:
 *  - messages   : array of { role, text, sources? }
 *  - input      : string — controlled textarea value
 *  - thinking   : bool — LLM is generating; triggers the glow animation
 *
 * The /ask endpoint can be slow (local llama3 is not fast).
 * We show a "Thinking…" message while we wait, then replace it with the real answer.
 */
export default function ChatPanel({ currentDoc }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [thinking, setThinking] = useState(false);
  const bottomRef = useRef(null);
  const textareaRef = useRef(null);

  // Auto-scroll to latest message
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, thinking]);

  // Auto-resize textarea as user types
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = Math.min(ta.scrollHeight, 160) + 'px';
  }, [input]);

  async function sendQuestion() {
    const question = input.trim();
    if (!question || thinking) return;

    if (!currentDoc) {
      setMessages(prev => [...prev, {
        role: 'error',
        text: 'Upload a PDF first, then ask questions about it.',
      }]);
      return;
    }

    // 1. Show user's message immediately
    setMessages(prev => [...prev, { role: 'user', text: question }]);
    setInput('');
    setThinking(true);

    try {
      // 2. POST to /ask — this can take 10-30s for local llama3
      const res = await fetch('/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question, filename: currentDoc }),
      });

      if (!res.ok) {
        const body = await res.text();
        let message = body || `Server error ${res.status}`;
        try {
          const parsed = JSON.parse(body);
          if (parsed.detail) {
            message = typeof parsed.detail === 'string'
              ? parsed.detail
              : JSON.stringify(parsed.detail);
          }
        } catch {
          // keep raw body
        }
        throw new Error(message);
      }

      const data = await res.json();   // { answer: "...", sources: [...] }

      // 3. Append assistant's answer with sources
      setMessages(prev => [...prev, {
        role: 'assistant',
        text: data.answer,
        sources: data.sources,
      }]);
    } catch (err) {
      setMessages(prev => [...prev, {
        role: 'error',
        text: `Something went wrong: ${err.message}`,
      }]);
    } finally {
      setThinking(false);
    }
  }

  function onKeyDown(e) {
    // Send on Enter, newline on Shift+Enter
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendQuestion();
    }
  }

  const placeholder = currentDoc
    ? `Ask anything about "${currentDoc}"…`
    : 'Upload a PDF first, then ask questions here…';

  return (
    <div className={styles.panel}>
      {/* ── Message list ── */}
      <div className={styles.messages}>
        {messages.length === 0 && (
          <EmptyState hasDoc={!!currentDoc} />
        )}

        {messages.map((msg, i) => (
          <ChatMessage key={i} {...msg} />
        ))}

        {/* Thinking indicator */}
        {thinking && (
          <div className={styles.thinking}>
            <span />
            <span />
            <span />
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* ── Input row ── */}
      <div className={`${styles.inputRow} ${thinking ? styles.glowing : ''}`}>
        <textarea
          ref={textareaRef}
          className={styles.textarea}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          disabled={thinking}
          rows={1}
          aria-label="Your question"
        />
        <button
          className={styles.sendBtn}
          onClick={sendQuestion}
          disabled={!input.trim() || thinking}
          aria-label="Send question"
        >
          {thinking ? '…' : '↑'}
        </button>
      </div>
    </div>
  );
}

/**
 * EmptyState
 * ----------
 * Shown before any messages exist. Gives the user direction.
 */
function EmptyState({ hasDoc }) {
  return (
    <div className={styles.empty}>
      <div className={styles.emptyIcon}>⬡</div>
      <p className={styles.emptyTitle}>
        {hasDoc ? 'Document loaded. Ask away.' : 'No document loaded yet.'}
      </p>
      <p className={styles.emptySub}>
        {hasDoc
          ? 'Your questions are answered using only content from your PDF — no hallucination, no guessing.'
          : 'Upload a PDF on the left to get started.'}
      </p>
    </div>
  );
}