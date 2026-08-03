import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/TextLayer.css';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import styles from './PdfPreview.module.css';

pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString();

function normalizeText(value) {
  return (value || '').toLowerCase().replace(/\s+/g, ' ').trim();
}

/**
 * Build a matcher that marks PDF text-layer spans belonging to the
 * retrieved chunk (exact RAG passage), not just the page.
 */
function createHighlightMatcher(excerpt) {
  const full = normalizeText(excerpt);
  if (full.length < 8) {
    return () => false;
  }

  // Prefer longer contiguous phrases so short common words are not marked.
  const phrases = [];
  const words = full.split(' ').filter(Boolean);
  const window = 6;
  for (let i = 0; i + window <= words.length; i += 3) {
    phrases.push(words.slice(i, i + window).join(' '));
  }
  if (words.length >= 4) {
    phrases.unshift(words.slice(0, Math.min(12, words.length)).join(' '));
    phrases.push(words.slice(Math.max(0, words.length - 12)).join(' '));
  }

  const uniquePhrases = [...new Set(phrases.filter(p => p.length >= 12))];

  return (str) => {
    const token = normalizeText(str);
    if (!token || token.length < 3) return false;
    if (full.includes(token) && token.length >= 5) return true;
    // Multi-item PDF spans: check overlap with known phrases
    return uniquePhrases.some(phrase => (
      phrase.includes(token) || token.includes(phrase.slice(0, Math.min(phrase.length, 24)))
    ));
  };
}

/**
 * PdfPreview
 * ----------
 * Shows the exact retrieved passage, then renders that PDF page with
 * matching text highlighted in the PDF.js text layer.
 */
export default function PdfPreview({
  filename,
  page,
  excerpt,
  width,
  onPageChange,
  onClose,
}) {
  const [numPages, setNumPages] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [pageWidth, setPageWidth] = useState(Math.max(260, (width || 420) - 24));
  const viewerRef = useRef(null);
  const displayPage = Math.max(1, page || 1);
  const fileUrl = filename
    ? `/documents/${encodeURIComponent(filename)}/file`
    : null;

  const shouldHighlight = Boolean(excerpt && excerpt.trim());
  const matchesHighlight = useMemo(
    () => (shouldHighlight ? createHighlightMatcher(excerpt) : () => false),
    [excerpt, shouldHighlight],
  );

  const customTextRenderer = useCallback(({ str }) => {
    if (matchesHighlight(str)) {
      return `<mark class="${styles.hit}">${escapeHtml(str)}</mark>`;
    }
    return escapeHtml(str);
  }, [matchesHighlight]);

  useEffect(() => {
    setLoadError(null);
  }, [filename, displayPage, excerpt]);

  useEffect(() => {
    function measure() {
      const panel = viewerRef.current;
      if (panel) {
        setPageWidth(Math.max(240, panel.clientWidth - 16));
      } else if (width) {
        setPageWidth(Math.max(240, width - 24));
      }
    }
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [width]);

  if (!filename || !fileUrl) return null;

  const maxPage = numPages || displayPage;
  const panelStyle = width ? { width, minWidth: width, maxWidth: width } : undefined;

  return (
    <aside
      className={styles.panel}
      style={panelStyle}
      aria-label="PDF preview"
    >
      <div className={styles.header}>
        <div className={styles.titleBlock}>
          <span className={styles.label}>Preview</span>
          <span className={styles.filename} title={filename}>{filename}</span>
        </div>
        <div className={styles.controls}>
          <button
            type="button"
            className={styles.pageBtn}
            onClick={() => onPageChange(Math.max(1, displayPage - 1))}
            disabled={displayPage <= 1}
            aria-label="Previous page"
          >
            ‹
          </button>
          <span className={styles.pageLabel}>
            p.{displayPage}{numPages ? ` / ${numPages}` : ''}
          </span>
          <button
            type="button"
            className={styles.pageBtn}
            onClick={() => onPageChange(Math.min(maxPage, displayPage + 1))}
            disabled={numPages != null && displayPage >= numPages}
            aria-label="Next page"
          >
            ›
          </button>
          <button
            type="button"
            className={styles.closeBtn}
            onClick={onClose}
            title="Hide PDF preview"
            aria-label="Hide PDF preview"
          >
            ×
          </button>
        </div>
      </div>

      {shouldHighlight && (
        <div className={styles.excerptBox}>
          <div className={styles.excerptHeader}>
            <span>Exact retrieved passage</span>
            <span className={styles.excerptPage}>p.{displayPage}</span>
          </div>
          <pre className={styles.excerptText}>{excerpt}</pre>
        </div>
      )}

      <div className={styles.viewer} ref={viewerRef}>
        {loadError ? (
          <div className={styles.error}>{loadError}</div>
        ) : (
          <Document
            file={fileUrl}
            loading={<div className={styles.loading}>Loading PDF…</div>}
            onLoadSuccess={({ numPages: n }) => {
              setNumPages(n);
              setLoadError(null);
            }}
            onLoadError={(err) => {
              const detail = err?.message || String(err);
              setLoadError(`Could not load PDF preview: ${detail}`);
            }}
            error={<div className={styles.error}>Failed to render PDF document.</div>}
          >
            <Page
              pageNumber={Math.min(displayPage, maxPage)}
              width={pageWidth}
              renderAnnotationLayer
              renderTextLayer
              customTextRenderer={shouldHighlight ? customTextRenderer : undefined}
              loading={<div className={styles.loading}>Rendering page…</div>}
            />
          </Document>
        )}
      </div>
    </aside>
  );
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
