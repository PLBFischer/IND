import { useEffect, useState } from 'react';
import type {
  BiologicalPathwayNode,
  EditorMode,
} from '../types/graph';
import type { PathwayPaperSource } from '../types/pathway';
import { createId } from '../utils/graph';

type PathwayNodeEditorProps = {
  mode: EditorMode;
  node: BiologicalPathwayNode | null;
  isConnectMode: boolean;
  isBuilding: boolean;
  buildError: string | null;
  registerCloseHandler?: (handler: (() => void) | null) => void;
  onClose: () => void;
  onSave: (values: Omit<BiologicalPathwayNode, 'id' | 'x' | 'y'>) => void;
  onDelete: () => void;
  onStartConnect: () => void;
  onCancelConnect: () => void;
  onBuild: (values: Omit<BiologicalPathwayNode, 'id' | 'x' | 'y'>) => void;
  onOpenExplorer: () => void;
};

const createSource = (): PathwayPaperSource => ({
  sourceId: createId('source'),
  sourceType: 'raw_text',
  sourceValue: '',
  label: '',
});

const toFocusTerms = (value: string) =>
  value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

export function PathwayNodeEditor({
  mode,
  node,
  isConnectMode,
  isBuilding,
  buildError,
  registerCloseHandler,
  onClose,
  onSave,
  onDelete,
  onStartConnect,
  onCancelConnect,
  onBuild,
  onOpenExplorer,
}: PathwayNodeEditorProps) {
  const [title, setTitle] = useState('');
  const [summary, setSummary] = useState('');
  const [focusTermsText, setFocusTermsText] = useState('');
  const [paperSources, setPaperSources] = useState<PathwayPaperSource[]>([createSource()]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (mode === 'edit' && node) {
      setTitle(node.title);
      setSummary(node.summary ?? '');
      setFocusTermsText((node.focusTerms ?? []).join(', '));
      setPaperSources(node.paperSources.length > 0 ? node.paperSources : [createSource()]);
      setError(null);
      return;
    }

    if (mode === 'create') {
      setTitle('');
      setSummary('');
      setFocusTermsText('');
      setPaperSources([createSource()]);
      setError(null);
    }
  }, [mode, node]);

  if (mode === 'closed') {
    return null;
  }

  const baseValues = (): Omit<BiologicalPathwayNode, 'id' | 'x' | 'y'> => ({
    nodeKind: 'biological_pathway',
    title: title.trim(),
    summary: summary.trim(),
    focusTerms: toFocusTerms(focusTermsText),
    paperSources: paperSources.map((source) => ({
      ...source,
      label: source.label?.trim() || undefined,
      title: source.title?.trim() || null,
      sourceValue: source.sourceValue,
    })),
    extractionStatus: node?.extractionStatus ?? 'empty',
    extractionError: node?.extractionError ?? null,
    pathwayGraph: node?.pathwayGraph ?? null,
    sanityReport: node?.sanityReport ?? null,
    queryHistory: node?.queryHistory ?? [],
    lastBuiltAt: node?.lastBuiltAt ?? null,
    linkedExperimentNodeIds: node?.linkedExperimentNodeIds ?? [],
    lastBuildResponse: node?.lastBuildResponse ?? null,
    latestQueryResponse: node?.latestQueryResponse ?? null,
  });

  const isEditing = mode === 'edit' && node;
  const hasAnyPaperSource = paperSources.some(
    (source) => source.sourceValue.trim() || (source.label ?? '').trim(),
  );
  const isEmptyCreateDraft = () =>
    !title.trim() &&
    !summary.trim() &&
    !focusTermsText.trim() &&
    !hasAnyPaperSource;
  const validateBeforeSave = () => {
    if (!title.trim()) {
      setError('Title is required.');
      return false;
    }

    if (!paperSources.some((source) => source.sourceValue.trim())) {
      setError('Add at least one paper source or raw text block.');
      return false;
    }

    setError(null);
    return true;
  };
  const handleClose = () => {
    if (!isEditing && isEmptyCreateDraft()) {
      setError(null);
      onClose();
      return;
    }

    if (!validateBeforeSave()) {
      return;
    }

    onSave(baseValues());
    onClose();
  };

  useEffect(() => {
    registerCloseHandler?.(handleClose);
    return () => registerCloseHandler?.(null);
  }, [registerCloseHandler, handleClose]);

  return (
    <aside className="editor" aria-label={isEditing ? 'Edit pathway node' : 'Create pathway node'}>
      <div className="editor__header">
        <div>
          <span className="editor__eyebrow">{isEditing ? 'Selected Node' : 'New Node'}</span>
          <h2>{isEditing ? 'Edit Pathway Node' : 'Add Pathway Node'}</h2>
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
          <p>Select an experiment node to create a visual connection.</p>
          <button type="button" className="button" onClick={onCancelConnect}>
            Cancel Connect
          </button>
        </div>
      ) : null}

      <form
        className="editor__form"
        onSubmit={(event) => {
          event.preventDefault();
          if (!validateBeforeSave()) {
            return;
          }

          onSave(baseValues());
          onClose();
        }}
      >
        <section className="editor__section">
          <div className="editor__section-header">
            <h3>Basics</h3>
            <span>Mechanistic evidence node identity</span>
          </div>
          <label className="field">
            <span>Title</span>
            <input value={title} onChange={(event) => setTitle(event.target.value)} />
          </label>
          <label className="field">
            <span>Summary</span>
            <textarea
              value={summary}
              onChange={(event) => setSummary(event.target.value)}
              rows={3}
              placeholder="Mechanistic framing or current evidence summary."
            />
          </label>
          <label className="field">
            <span>Focus Terms</span>
            <input
              value={focusTermsText}
              onChange={(event) => setFocusTermsText(event.target.value)}
              placeholder="TNF, NF-kB, microglia"
            />
          </label>
        </section>

        <section className="editor__section">
          <div className="editor__section-header">
            <h3>Paper Sources</h3>
            <span>Prefer raw full text or fetchable PMC sources</span>
          </div>
          <div className="pathway-editor__sources">
            {paperSources.map((source) => (
              <article key={source.sourceId} className="pathway-editor__source">
                <div className="editor__section-grid editor__section-grid--two">
                  <label className="field">
                    <span>Label</span>
                    <input
                      value={source.label ?? ''}
                      onChange={(event) =>
                        setPaperSources((current) =>
                          current.map((entry) =>
                            entry.sourceId === source.sourceId
                              ? { ...entry, label: event.target.value }
                              : entry,
                          ),
                        )
                      }
                    />
                  </label>
                  <label className="field">
                    <span>Source Type</span>
                    <select
                      value={source.sourceType}
                      onChange={(event) =>
                        setPaperSources((current) =>
                          current.map((entry) =>
                            entry.sourceId === source.sourceId
                              ? {
                                  ...entry,
                                  sourceType: event.target.value as PathwayPaperSource['sourceType'],
                                }
                              : entry,
                          ),
                        )
                      }
                    >
                      <option value="raw_text">Raw full text</option>
                      <option value="pmcid">PMCID</option>
                      <option value="pmc_url">PMC URL</option>
                      <option value="pubmed_url">PubMed URL</option>
                    </select>
                  </label>
                </div>
                <label className="field">
                  <span>Source Value</span>
                  <textarea
                    value={source.sourceValue}
                    onChange={(event) =>
                      setPaperSources((current) =>
                        current.map((entry) =>
                          entry.sourceId === source.sourceId
                            ? { ...entry, sourceValue: event.target.value }
                            : entry,
                        ),
                      )
                    }
                    rows={source.sourceType === 'raw_text' ? 7 : 2}
                    placeholder={
                      source.sourceType === 'raw_text'
                        ? 'Paste full paper text here.'
                        : 'PMC1234567 or https://...'
                    }
                  />
                </label>
                <button
                  type="button"
                  className="button button--ghost"
                  onClick={() =>
                    setPaperSources((current) =>
                      current.length === 1
                        ? current
                        : current.filter((entry) => entry.sourceId !== source.sourceId),
                    )
                  }
                  disabled={paperSources.length === 1}
                >
                  Remove Source
                </button>
              </article>
            ))}
          </div>
          <button
            type="button"
            className="button"
            onClick={() => setPaperSources((current) => [...current, createSource()])}
          >
            Add Source
          </button>
        </section>

        <section className="editor__section">
          {node?.extractionError ? <p className="editor__error">{node.extractionError}</p> : null}
          {buildError ? <p className="editor__error">{buildError}</p> : null}
          {node?.lastBuildResponse?.warnings.length ? (
            <div className="pathway-editor__warnings">
              {node.lastBuildResponse.warnings.map((warning) => (
                <p key={warning}>{warning}</p>
              ))}
            </div>
          ) : null}
          <div className="editor__button-row">
            <button
              type="button"
              className="button button--primary"
              onClick={() => {
                if (!title.trim()) {
                  setError('Title is required.');
                  return;
                }
                onBuild(baseValues());
              }}
              disabled={isBuilding}
            >
              {isBuilding ? 'Reasoning...' : 'Build Pathway'}
            </button>
            <button
              type="button"
              className="button"
              onClick={onOpenExplorer}
              disabled={!node?.pathwayGraph}
            >
              Open Explorer
            </button>
          </div>
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
