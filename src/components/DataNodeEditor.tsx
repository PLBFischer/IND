import { useEffect, useRef, useState } from 'react';
import type { DataFileAttachment, DataNode, EditorMode } from '../types/graph';
import { createDataFileAttachment } from '../utils/data';

type DataNodeEditorProps = {
  mode: EditorMode;
  node: DataNode | null;
  isConnectMode: boolean;
  registerCloseHandler?: (handler: (() => void) | null) => void;
  onClose: () => void;
  onSave: (values: Omit<DataNode, 'id' | 'x' | 'y'>) => void;
  onDelete: () => void;
  onStartConnect: () => void;
  onCancelConnect: () => void;
};

const formatFileSize = (sizeBytes: number) => {
  if (sizeBytes < 1024) {
    return `${sizeBytes} B`;
  }
  if (sizeBytes < 1024 * 1024) {
    return `${(sizeBytes / 1024).toFixed(1)} KB`;
  }
  return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`;
};

export function DataNodeEditor({
  mode,
  node,
  isConnectMode,
  registerCloseHandler,
  onClose,
  onSave,
  onDelete,
  onStartConnect,
  onCancelConnect,
}: DataNodeEditorProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [files, setFiles] = useState<DataFileAttachment[]>([]);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (mode === 'edit' && node) {
      setTitle(node.title);
      setDescription(node.description);
      setFiles(node.files);
      setError(null);
      return;
    }

    if (mode === 'create') {
      setTitle('');
      setDescription('');
      setFiles([]);
      setError(null);
    }
  }, [mode, node]);

  if (mode === 'closed') {
    return null;
  }

  const isEditing = mode === 'edit' && node;
  const buildNodeValues = () => {
    const nextTitle = title.trim();
    if (!nextTitle) {
      setError('Title is required.');
      return null;
    }

    setError(null);
    return {
      nodeKind: 'data' as const,
      title: nextTitle,
      description: description.trim(),
      files,
      linkedExperimentNodeIds: node?.linkedExperimentNodeIds ?? [],
    };
  };

  const isEmptyCreateDraft = () =>
    !title.trim() &&
    !description.trim() &&
    files.length === 0;

  const handleClose = () => {
    if (!isEditing && isEmptyCreateDraft()) {
      setError(null);
      onClose();
      return;
    }

    const values = buildNodeValues();
    if (!values) {
      return;
    }

    onSave(values);
    onClose();
  };

  useEffect(() => {
    registerCloseHandler?.(handleClose);
    return () => registerCloseHandler?.(null);
  }, [registerCloseHandler, handleClose]);

  return (
    <aside className="editor" aria-label={isEditing ? 'Edit data node' : 'Create data node'}>
      <div className="editor__header">
        <div>
          <span className="editor__eyebrow">{isEditing ? 'Selected Node' : 'New Node'}</span>
          <h2>{isEditing ? 'Edit Data Node' : 'Add Data Node'}</h2>
        </div>
        <button
          type="button"
          className="icon-button"
          onClick={handleClose}
          aria-label="Close editor"
        >
          Close
        </button>
      </div>

      {isConnectMode && isEditing ? (
        <div className="editor__notice">
          <p>Select an experiment node to create a visual connection into this dataset.</p>
          <button type="button" className="button" onClick={onCancelConnect}>
            Cancel Connect
          </button>
        </div>
      ) : null}

      <form
        className="editor__form"
        onSubmit={(event) => {
          event.preventDefault();
          const values = buildNodeValues();
          if (!values) {
            return;
          }

          onSave(values);
          onClose();
        }}
      >
        <section className="editor__section">
          <div className="editor__section-header">
            <h3>Basics</h3>
            <span>Dataset identity and summary</span>
          </div>
          <label className="field">
            <span>Title</span>
            <input
              value={title}
              onChange={(event) => {
                setTitle(event.target.value);
                if (error) {
                  setError(null);
                }
              }}
              placeholder="Rodent PK raw concentration tables"
            />
          </label>
          <label className="field">
            <span>Dataset Description</span>
            <textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              rows={4}
              placeholder="Describe what this dataset contains and why it matters."
            />
          </label>
        </section>

        <section className="editor__section">
          <div className="editor__section-header">
            <h3>Files</h3>
            <span>Attach uploaded files to this data node</span>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            hidden
            onChange={(event) => {
              const selectedFiles = Array.from(event.target.files ?? []);
              if (selectedFiles.length === 0) {
                return;
              }
              setFiles((current) => [...current, ...selectedFiles.map(createDataFileAttachment)]);
              event.target.value = '';
            }}
          />
          <div className="editor__button-row">
            <button type="button" className="button" onClick={() => fileInputRef.current?.click()}>
              Add Files
            </button>
          </div>
          {files.length > 0 ? (
            <div className="data-editor__files">
              {files.map((file) => (
                <article key={file.id} className="data-editor__file">
                  <div>
                    <strong>{file.name}</strong>
                    <p className="data-editor__file-meta">
                      {formatFileSize(file.sizeBytes)} | {file.mimeType}
                    </p>
                  </div>
                  <button
                    type="button"
                    className="button button--ghost"
                    onClick={() =>
                      setFiles((current) => current.filter((entry) => entry.id !== file.id))
                    }
                  >
                    Remove
                  </button>
                </article>
              ))}
            </div>
          ) : (
            <p className="editor__risk-text">No files uploaded yet.</p>
          )}
        </section>

        {error ? <p className="editor__error">{error}</p> : null}

        <div className="editor__footer">
          {isEditing ? (
            <div className="editor__footer-actions">
              <button type="button" className="button" onClick={onStartConnect}>
                Connect
              </button>
              <button type="button" className="button button--ghost" onClick={onDelete}>
                Delete
              </button>
            </div>
          ) : <span />}
        </div>
      </form>
    </aside>
  );
}
