import { useMemo, useState } from 'react';
import type { ChatMessage, FlowNode } from '../types/graph';

type ChatPanelProps = {
  isOpen: boolean;
  isLoading: boolean;
  error: string | null;
  messages: ChatMessage[];
  nodes: FlowNode[];
  onClose: () => void;
  onSend: (content: string) => void;
  onReferenceClick: (nodeId: string) => void;
};

export function ChatPanel({
  isOpen,
  isLoading,
  error,
  messages,
  nodes,
  onClose,
  onSend,
  onReferenceClick,
}: ChatPanelProps) {
  const [draft, setDraft] = useState('');
  const nodeTitleById = useMemo(
    () => Object.fromEntries(nodes.map((node) => [node.id, node.title])),
    [nodes],
  );

  if (!isOpen) {
    return null;
  }

  return (
    <aside className="chat-panel" aria-label="Grounded chat panel">
      <div className="chat-panel__header">
        <div>
          <span className="toolbar__eyebrow">Grounded Chat</span>
          <h2>Program Q&amp;A</h2>
        </div>
        <button type="button" className="icon-button" onClick={onClose}>
          Close
        </button>
      </div>

      <div className="chat-panel__messages">
        {messages.length === 0 ? (
          <div className="chat-panel__empty">
            <p>
              Ask about dependencies, critical path, Phase 1 assumptions, IND story
              coherence, or any specific node.
            </p>
          </div>
        ) : null}

        {messages.map((message, index) => (
          <div
            key={`${message.role}-${index}`}
            className={`chat-panel__message chat-panel__message--${message.role}`}
          >
            <span className="chat-panel__role">
              {message.role === 'user' ? 'You' : 'Assistant'}
            </span>
            <p>{message.content}</p>
            {message.role === 'assistant' && message.referencedNodeIds.length > 0 ? (
              <div className="chat-panel__references">
                {message.referencedNodeIds.map((nodeId) => (
                  <button
                    key={nodeId}
                    type="button"
                    className="chat-panel__reference"
                    onClick={() => onReferenceClick(nodeId)}
                    title={nodeId}
                  >
                    {nodeTitleById[nodeId] ?? nodeId}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        ))}

        {isLoading ? (
          <div className="chat-panel__message chat-panel__message--assistant">
            <span className="chat-panel__role">Assistant</span>
            <p>Thinking…</p>
          </div>
        ) : null}
      </div>

      {error ? <p className="chat-panel__error">{error}</p> : null}

      <form
        className="chat-panel__composer"
        onSubmit={(event) => {
          event.preventDefault();
          const nextDraft = draft.trim();
          if (!nextDraft || isLoading) {
            return;
          }

          onSend(nextDraft);
          setDraft('');
        }}
      >
        <textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Ask about the graph and current clinic-bound story"
          rows={5}
          spellCheck={false}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              const nextDraft = draft.trim();
              if (!nextDraft || isLoading) {
                return;
              }

              onSend(nextDraft);
              setDraft('');
            }
          }}
        />
        <button type="submit" className="button button--primary" disabled={isLoading}>
          Send
        </button>
      </form>
    </aside>
  );
}
