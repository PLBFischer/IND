import { useEffect, useState } from 'react';
import type { EditorMode, FlowNode } from '../types/graph';

type NodeEditorProps = {
  mode: EditorMode;
  node: FlowNode | null;
  personnel: string[];
  isConnectMode: boolean;
  onClose: () => void;
  onSave: (values: {
    title: string;
    content: string;
    cost: number;
    duration: number;
    operators: string[];
    completed: boolean;
  }) => void;
  onDelete: () => void;
  onStartConnect: () => void;
  onCancelConnect: () => void;
};

export function NodeEditor({
  mode,
  node,
  personnel,
  isConnectMode,
  onClose,
  onSave,
  onDelete,
  onStartConnect,
  onCancelConnect,
}: NodeEditorProps) {
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [cost, setCost] = useState('0');
  const [duration, setDuration] = useState('0');
  const [operators, setOperators] = useState<string[]>([]);
  const [isOperatorMenuOpen, setIsOperatorMenuOpen] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (mode === 'edit' && node) {
      setTitle(node.title);
      setContent(node.content);
      setCost(`${node.cost}`);
      setDuration(`${node.duration}`);
      setOperators(node.operators);
      setIsOperatorMenuOpen(false);
      setCompleted(node.completed);
      setError(null);
      return;
    }

    if (mode === 'create') {
      setTitle('');
      setContent('');
      setCost('0');
      setDuration('0');
      setOperators([]);
      setIsOperatorMenuOpen(false);
      setCompleted(false);
      setError(null);
    }
  }, [mode, node]);

  useEffect(() => {
    setOperators((current) =>
      current.filter((operator) => personnel.includes(operator)),
    );
  }, [personnel]);

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

          const nextCost = Number(cost);
          const nextDuration = Number(duration);

          if (!Number.isFinite(nextCost) || !Number.isFinite(nextDuration)) {
            setError('Cost and duration must be valid numbers.');
            return;
          }

          onSave({
            title: nextTitle,
            content: content.trim(),
            cost: nextCost,
            duration: nextDuration,
            operators,
            completed,
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

        <label className="field">
          <span>Cost (in USD)</span>
          <input
            type="number"
            step="any"
            value={cost}
            onChange={(event) => setCost(event.target.value)}
            placeholder="0"
          />
        </label>

        <label className="field">
          <span>Duration (in days)</span>
          <input
            type="number"
            step="any"
            value={duration}
            onChange={(event) => setDuration(event.target.value)}
            placeholder="0"
          />
        </label>

        <div className="field">
          <span>Eligible Operators</span>
          <div className="multi-select">
            <button
              type="button"
              className={`multi-select__trigger ${
                isOperatorMenuOpen ? 'multi-select__trigger--open' : ''
              }`}
              onClick={() => setIsOperatorMenuOpen((current) => !current)}
            >
              {operators.length > 0
                ? operators.join(', ')
                : 'Select eligible operators'}
            </button>
            {isOperatorMenuOpen ? (
              <div className="multi-select__menu">
                {personnel.length === 0 ? (
                  <p className="multi-select__empty">Add personnel to assign operators.</p>
                ) : (
                  personnel.map((person) => (
                    <label key={person} className="multi-select__option">
                      <input
                        type="checkbox"
                        checked={operators.includes(person)}
                        onChange={(event) => {
                          setOperators((current) =>
                            event.target.checked
                              ? [...current, person]
                              : current.filter((operator) => operator !== person),
                          );
                        }}
                      />
                      <span>{person}</span>
                    </label>
                  ))
                )}
              </div>
            ) : null}
          </div>
        </div>

        {isEditing ? (
          <label className="checkbox-field">
            <input
              type="checkbox"
              checked={completed}
              onChange={(event) => setCompleted(event.target.checked)}
            />
            <span>Completed</span>
          </label>
        ) : null}

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
