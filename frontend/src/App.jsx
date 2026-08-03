import React, { useState, useEffect, useCallback, useRef } from 'react';
import UploadPanel from './components/UploadPanel';
import ChatPanel from './components/ChatPanel';
import PdfPreview from './components/PdfPreview';
import styles from './App.module.css';

const PREVIEW_WIDTH_KEY = 'rag-pdf-preview-width';
const DEFAULT_PREVIEW_WIDTH = 420;
const MIN_PREVIEW_WIDTH = 280;
const MIN_CHAT_WIDTH = 320;

function loadSavedWidth() {
  try {
    const raw = localStorage.getItem(PREVIEW_WIDTH_KEY);
    const n = Number(raw);
    if (Number.isFinite(n) && n >= MIN_PREVIEW_WIDTH) return n;
  } catch {
    // ignore
  }
  return DEFAULT_PREVIEW_WIDTH;
}

/**
 * App
 * ---
 * PDF pane is toggleable and drag-resizable (width persisted).
 */
export default function App() {
  const [documents, setDocuments] = useState([]);
  const [currentDoc, setCurrentDoc] = useState(null);
  const [chatsByDoc, setChatsByDoc] = useState({});
  const [libraryError, setLibraryError] = useState(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewPage, setPreviewPage] = useState(1);
  const [previewExcerpt, setPreviewExcerpt] = useState(null);
  const [previewWidth, setPreviewWidth] = useState(loadSavedWidth);
  const [isResizing, setIsResizing] = useState(false);
  const layoutRef = useRef(null);

  const refreshDocuments = useCallback(async () => {
    try {
      const res = await fetch('/documents');
      if (!res.ok) {
        throw new Error(`Failed to load documents (${res.status})`);
      }
      const data = await res.json();
      const docs = data.documents || [];
      setDocuments(docs);
      setLibraryError(null);

      setCurrentDoc(prev => {
        if (prev && docs.some(d => d.filename === prev)) return prev;
        return docs[0]?.filename ?? null;
      });
    } catch (err) {
      setLibraryError(err.message);
    }
  }, []);

  useEffect(() => {
    refreshDocuments();
  }, [refreshDocuments]);

  useEffect(() => {
    setPreviewPage(1);
    setPreviewExcerpt(null);
  }, [currentDoc]);

  useEffect(() => {
    try {
      localStorage.setItem(PREVIEW_WIDTH_KEY, String(previewWidth));
    } catch {
      // ignore
    }
  }, [previewWidth]);

  useEffect(() => {
    if (!isResizing) return undefined;

    function onMove(e) {
      const layout = layoutRef.current;
      if (!layout) return;
      const rect = layout.getBoundingClientRect();
      const fromRight = rect.right - e.clientX;
      const maxWidth = Math.max(MIN_PREVIEW_WIDTH, rect.width - MIN_CHAT_WIDTH - 280);
      const next = Math.min(maxWidth, Math.max(MIN_PREVIEW_WIDTH, fromRight));
      setPreviewWidth(next);
    }

    function onUp() {
      setIsResizing(false);
    }

    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [isResizing]);

  function handleSelectDoc(filename) {
    if (filename === currentDoc) return;
    setCurrentDoc(filename);
  }

  function handleUploadSuccess(filename) {
    setCurrentDoc(filename);
    refreshDocuments();
  }

  async function handleDeleteDoc(filename) {
    const res = await fetch(`/documents/${encodeURIComponent(filename)}`, {
      method: 'DELETE',
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

    setChatsByDoc(prev => {
      const next = { ...prev };
      delete next[filename];
      return next;
    });

    if (filename === currentDoc) {
      setPreviewOpen(false);
      setPreviewExcerpt(null);
    }

    await refreshDocuments();
  }

  function openPreview(target) {
    if (!currentDoc) return;

    if (typeof target === 'number') {
      setPreviewPage(Math.max(1, Math.floor(target)));
      setPreviewExcerpt(null);
      setPreviewOpen(true);
      return;
    }

    const page = typeof target?.page === 'number' && target.page > 0
      ? Math.floor(target.page)
      : 1;
    setPreviewPage(page);
    setPreviewExcerpt(target?.text || null);
    setPreviewOpen(true);
  }

  function closePreview() {
    setPreviewOpen(false);
    setPreviewExcerpt(null);
  }

  function togglePreview() {
    if (!currentDoc) return;
    if (previewOpen) {
      closePreview();
    } else {
      openPreview(previewPage || 1);
    }
  }

  function handlePageChange(nextPage) {
    setPreviewPage(nextPage);
    setPreviewExcerpt(null);
  }

  const messages = currentDoc ? (chatsByDoc[currentDoc] || []) : [];

  function setMessagesForCurrent(updater) {
    if (!currentDoc) return;
    setChatsByDoc(prev => {
      const existing = prev[currentDoc] || [];
      const nextMessages = typeof updater === 'function'
        ? updater(existing)
        : updater;
      return { ...prev, [currentDoc]: nextMessages };
    });
  }

  const showPreview = previewOpen && Boolean(currentDoc);

  return (
    <div
      ref={layoutRef}
      className={`${styles.layout} ${isResizing ? styles.resizing : ''}`}
    >
      <UploadPanel
        documents={documents}
        currentDoc={currentDoc}
        onSelectDoc={handleSelectDoc}
        onUploadSuccess={handleUploadSuccess}
        onDeleteDoc={handleDeleteDoc}
        onPreviewDoc={togglePreview}
        previewOpen={previewOpen}
        libraryError={libraryError}
      />

      <div className={styles.main}>
        <ChatPanel
          currentDoc={currentDoc}
          messages={messages}
          setMessages={setMessagesForCurrent}
          onSourceClick={openPreview}
          previewOpen={showPreview}
          onTogglePreview={currentDoc ? togglePreview : null}
        />

        {showPreview && (
          <>
            <div
              className={styles.resizeHandle}
              role="separator"
              aria-orientation="vertical"
              aria-label="Resize PDF preview"
              aria-valuenow={Math.round(previewWidth)}
              tabIndex={0}
              onMouseDown={e => {
                e.preventDefault();
                setIsResizing(true);
              }}
              onDoubleClick={closePreview}
              onKeyDown={e => {
                if (e.key === 'ArrowLeft') {
                  setPreviewWidth(w => w + 24);
                } else if (e.key === 'ArrowRight') {
                  setPreviewWidth(w => Math.max(MIN_PREVIEW_WIDTH, w - 24));
                } else if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  closePreview();
                }
              }}
              title="Drag to resize · double-click to hide"
            />
            <PdfPreview
              filename={currentDoc}
              page={previewPage}
              excerpt={previewExcerpt}
              width={previewWidth}
              onPageChange={handlePageChange}
              onClose={closePreview}
            />
          </>
        )}

        {!showPreview && currentDoc && (
          <button
            type="button"
            className={styles.previewTab}
            onClick={togglePreview}
            title="Show PDF preview"
            aria-label="Show PDF preview"
          >
            <span className={styles.previewTabLabel}>PDF</span>
          </button>
        )}
      </div>
    </div>
  );
}
