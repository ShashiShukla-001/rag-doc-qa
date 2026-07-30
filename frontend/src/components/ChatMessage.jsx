import React, { useState } from 'react';
import styles from './ChatMessage.module.css';

/**
 * ChatMessage
 * -----------
 * Renders one message in the conversation.
 *
 * Props:
 *  - role    : 'user' | 'assistant' | 'error'
 *  - text    : string — the answer text
 *  - sources : array of { metadata: { source, page }, page_content: string }
 *              Only present on assistant messages from /ask
 *
 * The sources are collapsed by default and expand on click —
 * showing you exactly which chunk of your PDF the answer came from.
 * This is the RAG "grounding" made visible.
 */
export default function ChatMessage({ role, text, sources, streaming }) {
  const [sourcesOpen, setSourcesOpen] = useState(false);
  // Hide empty assistant bubble while waiting for the first token
  const showBubble = role !== 'assistant' || Boolean(text);

  return (
    <div className={`${styles.wrapper} ${styles[role]}`}>
      {/* Avatar dot */}
      <div className={styles.avatar}>
        {role === 'user' ? 'Y' : role === 'error' ? '!' : 'AI'}
      </div>

      <div className={styles.body}>
        {/* Message text — cursor while tokens are still arriving */}
        {showBubble && (
          <p className={styles.text}>
            {text}
            {streaming && <span className={styles.cursor} aria-hidden="true" />}
          </p>
        )}

        {/* Sources toggle — only shown on assistant messages that have sources */}
        {sources && sources.length > 0 && Boolean(text) && (
          <div className={styles.sources}>
            <button
              className={styles.sourcesToggle}
              onClick={() => setSourcesOpen(o => !o)}
              aria-expanded={sourcesOpen}
            >
              {sourcesOpen ? '▾' : '▸'} {sources.length} source{sources.length > 1 ? 's' : ''} used
            </button>

            {sourcesOpen && (
              <div className={styles.sourcesList}>
                {sources.map((s, i) => (
                  <SourceChunk key={i} source={s} />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * SourceChunk
 * -----------
 * Shows a short excerpt of the retrieved chunk (not the full ~1000 char block).
 */
function excerpt(text, maxLen = 180) {
  const cleaned = text.replace(/\s+/g, ' ').trim();
  if (cleaned.length <= maxLen) return cleaned;
  return `${cleaned.slice(0, maxLen).trimEnd()}…`;
}

function SourceChunk({ index, source }) {
  const page = source.metadata?.page;
  const content = excerpt(source.page_content || '');

  return (
    <div className={styles.chunk}>
      <p className={styles.chunkText}>
        {page !== undefined && (
          <span className={styles.chunkPage}>p.{page + 1} · </span>
        )}
        {content}
      </p>
    </div>
  );
}