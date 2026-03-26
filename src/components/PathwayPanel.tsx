import { useMemo, useState } from 'react';
import type { BiologicalPathwayNode } from '../types/graph';
import type { PathwayQueryResponse } from '../types/pathway';
import {
  computePathwayLayout,
  getEntityNameById,
  getRelationById,
  getRelationStyleClass,
  getSanityNoteSummary,
  getVisiblePathwayEntityIds,
  getVisiblePathwayRelations,
} from '../utils/pathway';
import { PathwayEvidenceDrawer } from './PathwayEvidenceDrawer';
import { PathwayQueryBar } from './PathwayQueryBar';

type PathwayPanelProps = {
  node: BiologicalPathwayNode | null;
  isOpen: boolean;
  isQuerying: boolean;
  queryError: string | null;
  queryResponse: PathwayQueryResponse | null;
  onClose: () => void;
  onQuery: (query: string) => void;
};

export function PathwayPanel({
  node,
  isOpen,
  isQuerying,
  queryError,
  queryResponse,
  onClose,
  onQuery,
}: PathwayPanelProps) {
  const [includeNondefaultRelations, setIncludeNondefaultRelations] = useState(false);
  const [includeStructuralRelations, setIncludeStructuralRelations] = useState(true);
  const [strongEvidenceOnly, setStrongEvidenceOnly] = useState(true);
  const [minConfidence, setMinConfidence] = useState(0.65);
  const [modality, setModality] = useState('all');
  const [selectedRelationId, setSelectedRelationId] = useState<string | null>(null);

  const graph = node?.pathwayGraph ?? null;
  const visibleEntityIds = useMemo(
    () =>
      graph
        ? getVisiblePathwayEntityIds(
            graph,
            {
              strongEvidenceOnly,
              includeNondefaultRelations,
              includeStructuralRelations,
              modality,
              minConfidence,
            },
            queryResponse,
          )
        : new Set<string>(),
    [
      graph,
      strongEvidenceOnly,
      includeNondefaultRelations,
      includeStructuralRelations,
      modality,
      minConfidence,
      queryResponse,
    ],
  );
  const visibleRelations = useMemo(
    () =>
      graph
        ? getVisiblePathwayRelations(graph, {
            strongEvidenceOnly,
            includeNondefaultRelations,
            includeStructuralRelations,
            modality,
            minConfidence,
          }).filter((relation) =>
            queryResponse?.subgraph_relation_ids.length
              ? queryResponse.subgraph_relation_ids.includes(relation.relation_id)
              : true,
          )
        : [],
    [
      graph,
      strongEvidenceOnly,
      includeNondefaultRelations,
      includeStructuralRelations,
      modality,
      minConfidence,
      queryResponse,
    ],
  );
  const layout = useMemo(
    () => (graph ? computePathwayLayout(graph, visibleEntityIds) : {}),
    [graph, visibleEntityIds],
  );
  const selectedRelation =
    graph && selectedRelationId ? getRelationById(graph, selectedRelationId) : null;

  if (!isOpen || !node || !graph) {
    return null;
  }

  return (
    <aside className="pathway-panel" aria-label="Pathway explorer">
      <div className="pathway-panel__header">
        <div>
          <span className="toolbar__eyebrow">Pathway Explorer</span>
          <h2>{node.title}</h2>
          <p>{node.summary || 'Inspect structured pathway evidence and graph sanity findings.'}</p>
        </div>
        <button type="button" className="icon-button" onClick={onClose}>
          Close
        </button>
      </div>

      <div className="pathway-panel__controls">
        <label>
          <input
            type="checkbox"
            checked={strongEvidenceOnly}
            onChange={(event) => setStrongEvidenceOnly(event.target.checked)}
          />
          Strong evidence only
        </label>
        <label>
          <input
            type="checkbox"
            checked={includeStructuralRelations}
            onChange={(event) => setIncludeStructuralRelations(event.target.checked)}
          />
          Structural relations
        </label>
        <label>
          <input
            type="checkbox"
            checked={includeNondefaultRelations}
            onChange={(event) => setIncludeNondefaultRelations(event.target.checked)}
          />
          Interpretive / background
        </label>
        <label className="pathway-panel__control">
          <span>Modality</span>
          <select value={modality} onChange={(event) => setModality(event.target.value)}>
            <option value="all">All</option>
            <option value="in_vivo">In vivo</option>
            <option value="in_vitro">In vitro</option>
            <option value="human">Human</option>
            <option value="ex_vivo">Ex vivo</option>
            <option value="computational">Computational</option>
          </select>
        </label>
        <label className="pathway-panel__control">
          <span>Min confidence</span>
          <input
            type="range"
            min={0.4}
            max={0.95}
            step={0.05}
            value={minConfidence}
            onChange={(event) => setMinConfidence(Number(event.target.value))}
          />
        </label>
      </div>

      <PathwayQueryBar isLoading={isQuerying} onSubmit={onQuery} />
      {queryError ? <p className="pathway-panel__error">{queryError}</p> : null}
      {queryResponse ? (
        <div className="pathway-panel__query-summary">
          <strong>{queryResponse.answer_summary}</strong>
          {queryResponse.notes.map((note) => (
            <p key={note}>{note}</p>
          ))}
        </div>
      ) : null}

      <div className="pathway-panel__content">
        <div className="pathway-panel__network-shell">
          <svg viewBox="0 0 560 440" className="pathway-panel__network">
            {visibleRelations.map((relation) => {
              const source = layout[relation.source_entity_id];
              const target = layout[relation.target_entity_id];
              if (!source || !target) {
                return null;
              }

              return (
                <g key={relation.relation_id}>
                  <line
                    className={`${getRelationStyleClass(graph, relation.relation_id)} ${
                      selectedRelationId === relation.relation_id
                        ? 'pathway-panel__edge--selected'
                        : ''
                    }`}
                    x1={source.x}
                    y1={source.y}
                    x2={target.x}
                    y2={target.y}
                    onClick={() => setSelectedRelationId(relation.relation_id)}
                  />
                </g>
              );
            })}
            {Array.from(visibleEntityIds).map((entityId) => {
              const point = layout[entityId];
              if (!point) {
                return null;
              }

              return (
                <g key={entityId} transform={`translate(${point.x}, ${point.y})`}>
                  <circle r={24} className="pathway-panel__entity" />
                  <text className="pathway-panel__entity-label" textAnchor="middle" y={4}>
                    {getEntityNameById(graph, entityId)}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>

        <div className="pathway-panel__sidebar">
          <section className="pathway-panel__section">
            <h3>Sanity</h3>
            <p>{getSanityNoteSummary(node.sanityReport)}</p>
            {(node.sanityReport?.sanity_findings ?? []).slice(0, 5).map((finding) => (
              <article key={finding.finding_id} className="pathway-panel__finding">
                <strong>{finding.finding_type.replace(/_/g, ' ')}</strong>
                <p>{finding.description}</p>
              </article>
            ))}
          </section>
          <section className="pathway-panel__section">
            <h3>Visible Relations</h3>
            <div className="pathway-panel__relation-list">
              {visibleRelations.map((relation) => (
                <button
                  key={relation.relation_id}
                  type="button"
                  className="pathway-panel__relation-button"
                  onClick={() => setSelectedRelationId(relation.relation_id)}
                >
                  {relation.summary}
                </button>
              ))}
            </div>
          </section>
          <PathwayEvidenceDrawer
            graph={graph}
            relation={selectedRelation}
            onClose={() => setSelectedRelationId(null)}
          />
        </div>
      </div>
    </aside>
  );
}
