import React, { useState, useRef, useEffect } from 'react';
import ChatMessage from './ChatMessage';
import styles from './ChatPanel.module.css';

/**
 * ChatPanel
 * ---------
 * Conversation for the currently selected document.
 * messages / setMessages are owned by App (per-document history).
 */
export default function ChatPanel({ currentDoc, messages, setMessages }) {
  const [input, setInput] = useState('');
  const [thinking, setThinking] = useState(false);
  const bottomRef = useRef(null);
  const messagesRef = useRef(null);
  const stickToBottomRef = useRef(true);
  const textareaRef = useRef(null);

  // Only auto-scroll while the user is already near the bottom.
  // Scrolling up during a stream pauses follow-along until they return.
  function onMessagesScroll() {
    const el = messagesRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    stickToBottomRef.current = distanceFromBottom < 80;
  }

  useEffect(() => {
    if (!stickToBottomRef.current) return;
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, thinking]);

  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = Math.min(ta.scrollHeight, 160) + 'px';
  }, [input]);

  // New question / doc switch: resume sticking to the latest message
  useEffect(() => {
    stickToBottomRef.current = true;
  }, [currentDoc]);

  // Stop showing a busy input when the user switches documents mid-stream
  useEffect(() => {
    setThinking(false);
    setInput('');
  }, [currentDoc]);

  function updateLastAssistant(updater) {
    setMessages(prev => {
      const next = [...prev];
      for (let i = next.length - 1; i >= 0; i--) {
        if (next[i].role === 'assistant') {
          next[i] = updater(next[i]);
          break;
        }
      }
      return next;
    });
  }

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

    const activeDoc = currentDoc;

    stickToBottomRef.current = true;
    setMessages(prev => [
      ...prev,
      { role: 'user', text: question },
      { role: 'assistant', text: '', sources: [], streaming: true },
    ]);
    setInput('');
    setThinking(true);

    try {
      const res = await fetch('/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question, filename: activeDoc }),
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

      if (!res.body) {
        throw new Error('No response body from server.');
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let sawToken = false;
      let streamError = null;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split('\n\n');
        buffer = parts.pop() ?? '';

        for (const part of parts) {
          const line = part.trim();
          if (!line.startsWith('data:')) continue;

          const payload = line.slice(5).trim();
          if (!payload) continue;

          let event;
          try {
            event = JSON.parse(payload);
          } catch {
            continue;
          }

          if (event.type === 'sources') {
            updateLastAssistant(msg => ({
              ...msg,
              sources: event.sources || [],
            }));
          } else if (event.type === 'token') {
            if (!sawToken) {
              sawToken = true;
              setThinking(false);
            }
            const chunk = event.content || '';
            if (chunk) {
              updateLastAssistant(msg => ({
                ...msg,
                text: (msg.text || '') + chunk,
              }));
            }
          } else if (event.type === 'error') {
            streamError = event.detail || 'Streaming failed.';
          } else if (event.type === 'done') {
            updateLastAssistant(msg => ({ ...msg, streaming: false }));
          }
        }
      }

      if (streamError) {
        throw new Error(streamError);
      }

      updateLastAssistant(msg => ({ ...msg, streaming: false }));
    } catch (err) {
      setMessages(prev => {
        const next = [...prev];
        const last = next[next.length - 1];
        if (last?.role === 'assistant' && !last.text) {
          next[next.length - 1] = {
            role: 'error',
            text: `Something went wrong: ${err.message}`,
          };
          return next;
        }
        return [...next, {
          role: 'error',
          text: `Something went wrong: ${err.message}`,
        }];
      });
      updateLastAssistant(msg => ({ ...msg, streaming: false }));
    } finally {
      setThinking(false);
    }
  }

  function onKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendQuestion();
    }
  }

  const placeholder = currentDoc
    ? `Ask anything about "${currentDoc}"…`
    : 'Upload a PDF first, then ask questions here…';

  const lastMessage = messages[messages.length - 1];
  const showThinking = thinking && !(lastMessage?.role === 'assistant' && lastMessage.text);

  return (
    <div className={styles.panel}>
      <div
        className={styles.messages}
        ref={messagesRef}
        onScroll={onMessagesScroll}
      >
        {messages.length === 0 && (
          <EmptyState hasDoc={!!currentDoc} docName={currentDoc} />
        )}

        {messages.map((msg, i) => {
          if (msg.role === 'assistant' && !msg.text && msg.streaming) {
            return null;
          }
          return <ChatMessage key={i} {...msg} />;
        })}

        {showThinking && (
          <div className={styles.thinking}>
            <span />
            <span />
            <span />
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      <div className={`${styles.inputRow} ${thinking ? styles.glowing : ''}`}>
        <textarea
          ref={textareaRef}
          className={styles.textarea}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          disabled={thinking || !currentDoc}
          rows={1}
          aria-label="Your question"
        />
        <button
          className={styles.sendBtn}
          onClick={sendQuestion}
          disabled={!input.trim() || thinking || !currentDoc}
          aria-label="Send question"
        >
          {thinking ? '…' : '↑'}
        </button>
      </div>
    </div>
  );
}

function EmptyState({ hasDoc, docName }) {
  return (
    <div className={styles.empty}>
      <div className={styles.emptyIcon}>⬡</div>
      <p className={styles.emptyTitle}>
        {hasDoc ? `Ready: ${docName}` : 'No document selected.'}
      </p>
      <p className={styles.emptySub}>
        {hasDoc
          ? 'Questions use only this PDF. Switch documents in the library anytime.'
          : 'Upload a PDF on the left to get started.'}
      </p>
    </div>
  );
}
