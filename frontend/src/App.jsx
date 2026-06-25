import React, { useState } from 'react';
import UploadPanel from './components/UploadPanel';
import ChatPanel from './components/ChatPanel';
import styles from './App.module.css';

/**
 * App
 * ---
 * Root component. Holds one piece of shared state:
 *   currentDoc — the filename of the PDF that has been ingested.
 *
 * UploadPanel sets it when a PDF is successfully ingested.
 * ChatPanel reads it to update the input placeholder.
 *
 * Everything else is self-contained in each component.
 */
export default function App() {
  const [currentDoc, setCurrentDoc] = useState(null);

  return (
    <div className={styles.layout}>
      <UploadPanel
        onUploadSuccess={setCurrentDoc}
        currentDoc={currentDoc}
      />
      <ChatPanel currentDoc={currentDoc} />
    </div>
  );
}