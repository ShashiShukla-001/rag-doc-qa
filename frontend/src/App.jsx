import React, { useState, useEffect, useCallback } from 'react';
import UploadPanel from './components/UploadPanel';
import ChatPanel from './components/ChatPanel';
import styles from './App.module.css';

/**
 * App
 * ---
 * Shared state:
 *   documents  — library entries from GET /documents
 *   currentDoc — active PDF filename (scopes /ask + chat history)
 *   chatsByDoc — per-document message history
 */
export default function App() {
  const [documents, setDocuments] = useState([]);
  const [currentDoc, setCurrentDoc] = useState(null);
  const [chatsByDoc, setChatsByDoc] = useState({});
  const [libraryError, setLibraryError] = useState(null);

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

    await refreshDocuments();
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

  return (
    <div className={styles.layout}>
      <UploadPanel
        documents={documents}
        currentDoc={currentDoc}
        onSelectDoc={handleSelectDoc}
        onUploadSuccess={handleUploadSuccess}
        onDeleteDoc={handleDeleteDoc}
        libraryError={libraryError}
      />
      <ChatPanel
        currentDoc={currentDoc}
        messages={messages}
        setMessages={setMessagesForCurrent}
      />
    </div>
  );
}
