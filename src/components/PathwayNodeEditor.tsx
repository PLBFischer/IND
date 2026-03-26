import { useEffect, useState } from 'react';
import type {
  BiologicalPathwayNode,
  ExperimentNode,
  EditorMode,
} from '../types/graph';
import type { PathwayPaperSource } from '../types/pathway';
import { createId } from '../utils/graph';

type PathwayNodeEditorProps = {
  mode: EditorMode;
  node: BiologicalPathwayNode | null;
  experimentNodes: ExperimentNode[];
  isBuilding: boolean;
  buildError: string | null;
  onClose: () => void;
  onSave: (values: Omit<BiologicalPathwayNode, 'id' | 'x' | 'y'>) => void;
  onDelete: () => void;
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
  experimentNodes,
  isBuilding,
  buildError,
  onClose,
  onSave,
  onDelete,
  onBuild,
  onOpenExplorer,
}: PathwayNodeEditorProps) {
  const [title, setTitle] = useState('');
  const [summary, setSummary] = useState('');
  const [focusTermsText, setFocusTermsText] = useState('');
  const [paperSources, setPaperSources] = useState<PathwayPaperSource[]>([createSource()]);
  const [linkedExperimentNodeIds, setLinkedExperimentNodeIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (mode === 'edit' && node) {
      setTitle(node.title);
      setSummary(node.summary ?? '');
      setFocusTermsText((node.focusTerms ?? []).join(', '));
      setPaperSources(node.paperSources.length > 0 ? node.paperSources : [createSource()]);
      setLinkedExperimentNodeIds(node.linkedExperimentNodeIds ?? []);
      setError(null);
      return;
    }

    if (mode === 'create') {
      setTitle('');
      setSummary('');
      setFocusTermsText('');
      setPaperSources([createSource()]);
      setLinkedExperimentNodeIds([]);
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
    linkedExperimentNodeIds,
    lastBuildResponse: node?.lastBuildResponse ?? null,
    latestQueryResponse: node?.latestQueryResponse ?? null,
  });

  const isEditing = mode === 'edit' && node;

  return (
    <aside className="editor" aria-label={isEditing ? 'Edit pathway node' : 'Create pathway node'}>
      <div className="editor__header">
        <div>
          <span className="editor__eyebrow">{isEditing ? 'Selected Node' : 'New Node'}</span>
          <h2>{isEditing ? 'Edit Pathway Node' : 'Add Pathway Node'}</h2>
        </div>
        <button type="button" className="icon-button" onClick={onClose} aria-label="Close editor">
          Close
        </button>
      </div>

      <form
        className="editor__form"
        onSubmit={(event) => {
          event.preventDefault();
          if (!title.trim()) {
            setError('Title is required.');
            return;
          }

          if (!paperSources.some((source) => source.sourceValue.trim())) {
            setError('Add at least one paper source or raw text block.');
            return;
          }

          onSave(baseValues());
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
          <div className="editor__section-header">
            <h3>Experiment Links</h3>
            <span>Optional mechanistic context for experiment nodes</span>
          </div>
          <div className="editor__checkbox-list">
            {experimentNodes.map((experimentNode) => (
              <label key={experimentNode.id} className="editor__checkbox-row">
                <input
                  type="checkbox"
                  checked={linkedExperimentNodeIds.includes(experimentNode.id)}
                  onChange={(event) =>
                    setLinkedExperimentNodeIds((current) =>
                      event.target.checked
                        ? [...current, experimentNode.id]
                        : current.filter((id) => id !== experimentNode.id),
                    )
                  }
                />
                <span>{experimentNode.title}</span>
              </label>
            ))}
          </div>
        </section>

        <section className="editor__section">
          <div className="editor__section-header">
            <h3>Build Status</h3>
            <span>Inspectability over automation</span>
          </div>
          <div className="pathway-editor__status-grid">
            <div>
              <span>Status</span>
              <strong>{node?.extractionStatus ?? 'empty'}</strong>
            </div>
            <div>
              <span>Default relations</span>
              <strong>{node?.pathwayGraph?.default_relations.length ?? 0}</strong>
            </div>
            <div>
              <span>Warnings</span>
              <strong>{node?.sanityReport?.summary.high_priority_issue_count ?? 0}</strong>
            </div>
          </div>
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
              {isBuilding ? 'Building...' : isEditing ? 'Rebuild Pathway' : 'Build Pathway'}
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
            <button type="button" className="button button--ghost" onClick={onDelete}>
              Delete Node
            </button>
          ) : <span />}
          <button type="submit" className="button button--primary">
            {isEditing ? 'Update Node' : 'Create Node'}
          </button>
        </div>
      </form>
    </aside>
  );
}
