import React, { useState, useRef } from 'react';
import styles from './UploadPanel.module.css';

/**
 * UploadPanel
 * -----------
 * Upload PDFs into a multi-document library and switch the active one.
 */
export default function UploadPanel({
  documents,
  currentDoc,
  onSelectDoc,
  onUploadSuccess,
  onDeleteDoc,
  libraryError,
}) {
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const fileRef = useRef(null);

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

      const data = await res.json();
      setProgress(data.message);
      onUploadSuccess(data.filename || file.name);
    } catch (err) {
      setError(err.message);
      setProgress('');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  async function deleteDoc(filename) {
    if (deleting) return;

    setError(null);
    setDeleting(filename);
    try {
      await onDeleteDoc(filename);
      setProgress(`Removed ${filename}`);
    } catch (err) {
      setError(err.message);
    } finally {
      setDeleting(null);
    }
  }

  function onDrop(e) {
    e.preventDefault();
    setDragOver(false);
    uploadFile(e.dataTransfer.files[0]);
  }

  function onDragOver(e) { e.preventDefault(); setDragOver(true); }
  function onDragLeave() { setDragOver(false); }
  function onFileChange(e) { uploadFile(e.target.files[0]); }

  return (
    <aside className={styles.panel}>
      <div className={styles.header}>
        <span className={styles.logo}>⬡</span>
        <span className={styles.logoText}>RAG Q&amp;A</span>
      </div>

      <p className={styles.hint}>
        Upload PDFs to your library, select one, then ask questions about it.
      </p>

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

      {progress && !error && (
        <p className={styles.success}>{progress}</p>
      )}
      {(error || libraryError) && (
        <p className={styles.error}>{error || libraryError}</p>
      )}

      <div className={styles.library}>
        <p className={styles.libraryTitle}>
          Library
          {documents.length > 0 && (
            <span className={styles.libraryCount}>{documents.length}</span>
          )}
        </p>

        {documents.length === 0 ? (
          <p className={styles.libraryEmpty}>No documents yet.</p>
        ) : (
          <ul className={styles.docList}>
            {documents.map(doc => {
              const active = doc.filename === currentDoc;
              return (
                <li key={doc.filename} className={`${styles.docItem} ${active ? styles.docItemActive : ''}`}>
                  <button
                    type="button"
                    className={styles.docSelect}
                    onClick={() => onSelectDoc(doc.filename)}
                    aria-current={active ? 'true' : undefined}
                  >
                    <span className={styles.docName}>{doc.filename}</span>
                    <span className={styles.docMeta}>
                      {doc.chunks} chunk{doc.chunks === 1 ? '' : 's'}
                    </span>
                  </button>
                  <button
                    type="button"
                    className={styles.docDelete}
                    title={`Remove ${doc.filename}`}
                    aria-label={`Remove ${doc.filename}`}
                    disabled={deleting === doc.filename}
                    onClick={() => deleteDoc(doc.filename)}
                  >
                    {deleting === doc.filename ? '…' : '×'}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className={styles.archNote}>
        <p className={styles.archTitle}>How it works</p>
        <p>PDF → chunks → embeddings → ChromaDB (kept per file)</p>
        <p>Ask → search active doc → llama3 stream → answer</p>
      </div>
    </aside>
  );
}
