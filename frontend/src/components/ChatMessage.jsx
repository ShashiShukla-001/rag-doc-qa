import React, { useState } from 'react';
import styles from './ChatMessage.module.css';

/**
 * ChatMessage
 * -----------
 * Source chunks call onSourceClick({ page, text }) so the preview can
 * jump to the page and highlight the exact retrieved passage.
 */
export default function ChatMessage({
  role,
  text,
  sources,
  streaming,
  cancelled,
  onSourceClick,
}) {
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const showBubble = role !== 'assistant' || Boolean(text);

  return (
    <div className={`${styles.wrapper} ${styles[role]}`}>
      <div className={styles.avatar}>
        {role === 'user' ? 'Y' : role === 'error' ? '!' : 'AI'}
      </div>

      <div className={styles.body}>
        {showBubble && (
          <p className={styles.text}>
            {text}
            {streaming && <span className={styles.cursor} aria-hidden="true" />}
          </p>
        )}

        {cancelled && (
          <p className={styles.cancelled}>Stopped</p>
        )}

        {sources && sources.length > 0 && Boolean(text) && text !== 'Generation stopped.' && (
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
                  <SourceChunk
                    key={i}
                    source={s}
                    onSourceClick={onSourceClick}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function excerpt(text, maxLen = 180) {
  const cleaned = text.replace(/\s+/g, ' ').trim();
  if (cleaned.length <= maxLen) return cleaned;
  return `${cleaned.slice(0, maxLen).trimEnd()}…`;
}

function SourceChunk({ source, onSourceClick }) {
  const page0 = source.metadata?.page;
  const hasPage = typeof page0 === 'number';
  const page1 = hasPage ? page0 + 1 : null;
  const fullText = source.page_content || '';
  const preview = excerpt(fullText);
  const clickable = typeof onSourceClick === 'function' && (hasPage || fullText);

  if (!clickable) {
    return (
      <div className={styles.chunk}>
        <p className={styles.chunkText}>
          {page1 !== null && (
            <span className={styles.chunkPage}>p.{page1} · </span>
          )}
          {preview}
        </p>
      </div>
    );
  }

  return (
    <button
      type="button"
      className={`${styles.chunk} ${styles.chunkButton}`}
      onClick={() => onSourceClick({
        page: page1 || 1,
        text: fullText,
      })}
      title={page1 ? `Show exact lines on page ${page1}` : 'Show exact retrieved passage'}
    >
      <p className={styles.chunkText}>
        {page1 !== null && (
          <span className={styles.chunkPage}>p.{page1} · </span>
        )}
        {preview}
      </p>
      <span className={styles.chunkHint}>Show exact lines →</span>
    </button>
  );
}
