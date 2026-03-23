import { useEffect, useState } from 'react';
import type { EditorMode, FlowNode } from '../types/graph';

type NodeEditorProps = {
  mode: EditorMode;
  node: FlowNode | null;
  isConnectMode: boolean;
  onClose: () => void;
  onSave: (values: { title: string; content: string }) => void;
  onDelete: () => void;
  onStartConnect: () => void;
  onCancelConnect: () => void;
};

export function NodeEditor({
  mode,
  node,
  isConnectMode,
  onClose,
  onSave,
  onDelete,
  onStartConnect,
  onCancelConnect,
}: NodeEditorProps) {
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (mode === 'edit' && node) {
      setTitle(node.title);
      setContent(node.content);
      setError(null);
      return;
    }

    if (mode === 'create') {
      setTitle('');
      setContent('');
      setError(null);
    }
  }, [mode, node]);

  if (mode === 'closed') {
    return null;
  }

  const isEditing = mode === 'edit' && node;

  return (
    <aside className="editor" aria-label={isEditing ? 'Edit node' : 'Create node'}>
      <div className="editor__header">
        <div>
          <span className="editor__eyebrow">{isEditing ? 'Selected Node' : 'New Node'}</span>
          <h2>{isEditing ? 'Edit Node' : 'Add Node'}</h2>
        </div>
        <button type="button" className="icon-button" onClick={onClose} aria-label="Close editor">
          Close
        </button>
      </div>

      {isConnectMode && isEditing ? (
        <div className="editor__notice">
          <p>Select a target node to create a connection.</p>
          <button type="button" className="button" onClick={onCancelConnect}>
            Cancel Connect
          </button>
        </div>
      ) : null}

      <form
        className="editor__form"
        onSubmit={(event) => {
          event.preventDefault();

          const nextTitle = title.trim();
          if (!nextTitle) {
            setError('Title is required.');
            return;
          }

          onSave({
            title: nextTitle,
            content: content.trim(),
          });
        }}
      >
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
            placeholder="Transformation"
          />
        </label>

        <label className="field">
          <span>Content</span>
          <textarea
            value={content}
            onChange={(event) => setContent(event.target.value)}
            rows={6}
            placeholder="Description: Joins customer orders"
          />
        </label>

        {error ? <p className="field-error">{error}</p> : null}

        <div className="editor__actions">
          <button type="submit" className="button button--primary">
            {isEditing ? 'Update Node' : 'Create Node'}
          </button>
          <button type="button" className="button" onClick={onClose}>
            Cancel
          </button>
        </div>
      </form>

      {isEditing ? (
        <div className="editor__footer">
          <button type="button" className="button" onClick={onStartConnect}>
            Connect
          </button>
          <button type="button" className="button button--danger" onClick={onDelete}>
            Delete
          </button>
        </div>
      ) : null}
    </aside>
  );
}
