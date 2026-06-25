import React, { useState, useRef } from 'react';
import styles from './UploadPanel.module.css';

/**
 * UploadPanel
 * -----------
 * Lets the user pick a PDF and POST it to /ingest.
 * Reports back to App via onUploadSuccess(filename) so the
 * chat panel knows which doc is loaded.
 *
 * State managed here:
 *  - dragOver   : bool — user is dragging a file over the zone
 *  - uploading  : bool — fetch is in flight
 *  - progress   : string — status message shown under the button
 *  - error      : string | null
 */
export default function UploadPanel({ onUploadSuccess, currentDoc }) {
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState(null);
  const fileRef = useRef(null);

  // ── Core upload logic ─────────────────────────────────────────
  async function uploadFile(file) {
    if (!file || file.type !== 'application/pdf') {
      setError('Please drop a PDF file.');
      return;
    }

    setError(null);
    setUploading(true);
    setProgress('Uploading…');

    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await fetch('/ingest', { method: 'POST', body: formData });

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

      const data = await res.json();           // { message: "Ingested 47 chunks from file.pdf" }
      setProgress(data.message);
      onUploadSuccess(file.name);              // tell App which doc is active
    } catch (err) {
      setError(err.message);
      setProgress('');
    } finally {
      setUploading(false);
    }
  }

  // ── Drag-and-drop handlers ────────────────────────────────────
  function onDrop(e) {
    e.preventDefault();
    setDragOver(false);
    uploadFile(e.dataTransfer.files[0]);
  }

  function onDragOver(e) { e.preventDefault(); setDragOver(true); }
  function onDragLeave()  { setDragOver(false); }

  // ── Click-to-browse ───────────────────────────────────────────
  function onFileChange(e) { uploadFile(e.target.files[0]); }

  return (
    <aside className={styles.panel}>
      {/* Header */}
      <div className={styles.header}>
        <span className={styles.logo}>⬡</span>
        <span className={styles.logoText}>RAG Q&amp;A</span>
      </div>

      <p className={styles.hint}>
        Upload a PDF, then ask questions about it below.
      </p>

      {/* Drop zone */}
      <div
        className={`${styles.dropzone} ${dragOver ? styles.active : ''} ${uploading ? styles.loading : ''}`}
        onDrop={onDrop}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onClick={() => !uploading && fileRef.current.click()}
        role="button"
        tabIndex={0}
        onKeyDown={e => e.key === 'Enter' && fileRef.current.click()}
        aria-label="Upload PDF"
      >
        <input
          ref={fileRef}
          type="file"
          accept=".pdf"
          className={styles.hidden}
          onChange={onFileChange}
        />

        {uploading ? (
          <div className={styles.spinner} aria-label="Uploading" />
        ) : (
          <>
            <div className={styles.dropIcon}>↑</div>
            <p className={styles.dropLabel}>
              {dragOver ? 'Release to upload' : 'Drop PDF here'}
            </p>
            <p className={styles.dropSub}>or click to browse</p>
          </>
        )}
      </div>

      {/* Status messages */}
      {progress && !error && (
        <p className={styles.success}>{progress}</p>
      )}
      {error && (
        <p className={styles.error}>{error}</p>
      )}

      {/* Currently loaded doc */}
      {currentDoc && (
        <div className={styles.docBadge}>
          <span className={styles.docIcon}>📄</span>
          <span className={styles.docName}>{currentDoc}</span>
        </div>
      )}

      {/* Architecture note — helps you understand your own system */}
      <div className={styles.archNote}>
        <p className={styles.archTitle}>How it works</p>
        <p>PDF → chunks (1000 chars) → embeddings → ChromaDB</p>
        <p>Then: question → vector search → llama3 → answer</p>
      </div>
    </aside>
  );
}