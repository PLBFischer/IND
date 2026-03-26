import { useEffect, useMemo, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import type { BiologicalPathwayNode } from '../types/graph';
import type { AggregatedRelation } from '../types/pathway';
import type { PathwayQueryResponse } from '../types/pathway';
import {
  PATHWAY_INTERACTION_LEGEND,
  computePathwayLayout,
  formatPathwayEvidenceModality,
  getBestRelationEvidence,
  getEntityNameById,
  getRelationById,
  getRelationEvidence,
  getPathwayRelationInteractionClass,
  getPathwayRelationMarkerId,
  getPathwayRelationTypeLabel,
  getRelationStyleClass,
  getSanityNoteSummary,
  getVisiblePathwayEntityIds,
  getVisiblePathwayRelations,
} from '../utils/pathway';
import { PathwayEvidenceDrawer } from './PathwayEvidenceDrawer';
import { PathwayQueryBar } from './PathwayQueryBar';

type Point = { x: number; y: number };

type EdgeTooltipState = {
  relation: AggregatedRelation;
  x: number;
  y: number;
};

type NodeDragState = {
  type: 'node';
  pointerId: number;
  entityId: string;
  offsetX: number;
  offsetY: number;
};

type PanState = {
  type: 'pan';
  pointerId: number;
  startClientX: number;
  startClientY: number;
  viewportX: number;
  viewportY: number;
};

type PinchState = {
  type: 'pinch';
  pointerIds: [number, number];
  startDistance: number;
  startZoom: number;
  worldX: number;
  worldY: number;
};

type InteractionState = NodeDragState | PanState | PinchState | null;

const NETWORK_WIDTH = 560;
const NETWORK_HEIGHT = 440;
const MIN_ZOOM = 0.6;
const MAX_ZOOM = 2.4;

const clampZoom = (value: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value));

const getDistance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

type PathwayPanelProps = {
  node: BiologicalPathwayNode | null;
  isOpen: boolean;
  isQuerying: boolean;
  queryError: string | null;
  queryResponse: PathwayQueryResponse | null;
  onClose: () => void;
  onQuery: (query: string) => void;
  onClearQuery: () => void;
};

export function PathwayPanel({
  node,
  isOpen,
  isQuerying,
  queryError,
  queryResponse,
  onClose,
  onQuery,
  onClearQuery,
}: PathwayPanelProps) {
  const [includeNondefaultRelations, setIncludeNondefaultRelations] = useState(false);
  const [includeStructuralRelations, setIncludeStructuralRelations] = useState(true);
  const [strongEvidenceOnly, setStrongEvidenceOnly] = useState(true);
  const [minConfidence, setMinConfidence] = useState(0.65);
  const [modality, setModality] = useState('all');
  const [selectedRelationId, setSelectedRelationId] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [viewport, setViewport] = useState({ x: 0, y: 0 });
  const [nodePositions, setNodePositions] = useState<Record<string, Point>>({});
  const [edgeTooltip, setEdgeTooltip] = useState<EdgeTooltipState | null>(null);
  const [transientQueryMessage, setTransientQueryMessage] = useState<string | null>(null);
  const networkShellRef = useRef<HTMLDivElement | null>(null);
  const networkSvgRef = useRef<SVGSVGElement | null>(null);
  const interactionRef = useRef<InteractionState>(null);
  const activePointersRef = useRef(new Map<number, Point>());
  const zoomRef = useRef(1);
  const viewportRef = useRef({ x: 0, y: 0 });

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

  useEffect(() => {
    zoomRef.current = zoom;
  }, [zoom]);

  useEffect(() => {
    viewportRef.current = viewport;
  }, [viewport]);

  useEffect(() => {
    setZoom(1);
    setViewport({ x: 0, y: 0 });
    setEdgeTooltip(null);
  }, [node?.id]);

  useEffect(() => {
    if (!queryError && (!queryResponse || queryResponse.query_status === 'ok')) {
      return;
    }

    const message =
      queryError ??
      queryResponse?.answer_summary ??
      'The query could not be fulfilled with the current pathway graph.';
    setTransientQueryMessage(message);
    const timeoutId = window.setTimeout(() => {
      setTransientQueryMessage(null);
    }, 3500);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [queryError, queryResponse]);

  useEffect(() => {
    setNodePositions((current) => {
      const next: Record<string, Point> = {};
      for (const entityId of Array.from(visibleEntityIds)) {
        next[entityId] = current[entityId] ?? layout[entityId];
      }
      return next;
    });
  }, [layout, visibleEntityIds]);

  useEffect(() => {
    if (!selectedRelationId) {
      return;
    }

    if (!visibleRelations.some((relation) => relation.relation_id === selectedRelationId)) {
      setSelectedRelationId(null);
    }
  }, [selectedRelationId, visibleRelations]);

  useEffect(() => {
    const shell = networkShellRef.current;
    if (!shell) {
      return;
    }

    const stopInteraction = () => {
      interactionRef.current = null;
      activePointersRef.current.clear();
    };

    const toSvgPoint = (clientX: number, clientY: number) => {
      const bounds = shell.getBoundingClientRect();
      return {
        x: ((clientX - bounds.left) / bounds.width) * NETWORK_WIDTH,
        y: ((clientY - bounds.top) / bounds.height) * NETWORK_HEIGHT,
      };
    };

    const handleWheel = (event: WheelEvent) => {
      event.preventDefault();
      const point = toSvgPoint(event.clientX, event.clientY);
      const currentZoom = zoomRef.current;
      const currentViewport = viewportRef.current;
      const worldX = (point.x - currentViewport.x) / currentZoom;
      const worldY = (point.y - currentViewport.y) / currentZoom;
      const nextZoom = clampZoom(currentZoom * Math.exp(-event.deltaY * 0.005));

      setZoom(nextZoom);
      setViewport({
        x: point.x - worldX * nextZoom,
        y: point.y - worldY * nextZoom,
      });
    };

    shell.addEventListener('wheel', handleWheel, { passive: false });

    return () => {
      stopInteraction();
      shell.removeEventListener('wheel', handleWheel);
    };
  }, []);

  if (!isOpen || !node || !graph) {
    return null;
  }

  const toSvgPoint = (clientX: number, clientY: number) => {
    const shell = networkShellRef.current;
    if (!shell) {
      return null;
    }

    const bounds = shell.getBoundingClientRect();
    return {
      x: ((clientX - bounds.left) / bounds.width) * NETWORK_WIDTH,
      y: ((clientY - bounds.top) / bounds.height) * NETWORK_HEIGHT,
    };
  };

  const beginPinch = () => {
    const shell = networkShellRef.current;
    if (!shell || activePointersRef.current.size < 2) {
      return;
    }

    const [firstEntry, secondEntry] = Array.from(activePointersRef.current.entries());
    if (!firstEntry || !secondEntry) {
      return;
    }

    const [firstId, first] = firstEntry;
    const [secondId, second] = secondEntry;
    const bounds = shell.getBoundingClientRect();
    const centerX = (((first.x + second.x) / 2) - bounds.left) / bounds.width * NETWORK_WIDTH;
    const centerY = (((first.y + second.y) / 2) - bounds.top) / bounds.height * NETWORK_HEIGHT;
    const currentZoom = zoomRef.current;
    const currentViewport = viewportRef.current;

    interactionRef.current = {
      type: 'pinch',
      pointerIds: [firstId, secondId],
      startDistance: Math.max(getDistance(first, second), 1),
      startZoom: currentZoom,
      worldX: (centerX - currentViewport.x) / currentZoom,
      worldY: (centerY - currentViewport.y) / currentZoom,
    };
  };

  const handleSvgPointerMove = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (!activePointersRef.current.has(event.pointerId)) {
      return;
    }

    activePointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const interaction = interactionRef.current;
    if (!interaction) {
      return;
    }

    if (interaction.type === 'node' && interaction.pointerId === event.pointerId) {
      const point = toSvgPoint(event.clientX, event.clientY);
      if (!point) {
        return;
      }

      setNodePositions((current) => ({
        ...current,
        [interaction.entityId]: {
          x: Math.max(32, (point.x - viewportRef.current.x) / zoomRef.current - interaction.offsetX),
          y: Math.max(32, (point.y - viewportRef.current.y) / zoomRef.current - interaction.offsetY),
        },
      }));
      return;
    }

    if (interaction.type === 'pan' && interaction.pointerId === event.pointerId) {
      const start = toSvgPoint(interaction.startClientX, interaction.startClientY);
      const current = toSvgPoint(event.clientX, event.clientY);
      if (!start || !current) {
        return;
      }

      setViewport({
        x: interaction.viewportX + (current.x - start.x),
        y: interaction.viewportY + (current.y - start.y),
      });
      return;
    }

    if (interaction.type === 'pinch') {
      const [firstId, secondId] = interaction.pointerIds;
      const first = activePointersRef.current.get(firstId);
      const second = activePointersRef.current.get(secondId);
      if (!first || !second) {
        return;
      }

      const distance = getDistance(first, second);
      const center = toSvgPoint((first.x + second.x) / 2, (first.y + second.y) / 2);
      if (!center) {
        return;
      }

      const nextZoom = clampZoom(interaction.startZoom * (distance / interaction.startDistance));
      setZoom(nextZoom);
      setViewport({
        x: center.x - interaction.worldX * nextZoom,
        y: center.y - interaction.worldY * nextZoom,
      });
    }
  };

  const clearPointerInteraction = (pointerId: number) => {
    activePointersRef.current.delete(pointerId);
    const interaction = interactionRef.current;
    if (!interaction) {
      return;
    }

    if (interaction.type === 'pinch') {
      const [firstId, secondId] = interaction.pointerIds;
      if (pointerId === firstId || pointerId === secondId) {
        interactionRef.current = null;
      }
      return;
    }

    if (interaction.pointerId === pointerId) {
      interactionRef.current = null;
    }
  };

  const handleSvgPointerUp = (event: ReactPointerEvent<SVGSVGElement>) => {
    clearPointerInteraction(event.pointerId);
    networkSvgRef.current?.releasePointerCapture(event.pointerId);
  };

  const handleSvgPointerCancel = (event: ReactPointerEvent<SVGSVGElement>) => {
    clearPointerInteraction(event.pointerId);
    networkSvgRef.current?.releasePointerCapture(event.pointerId);
  };

  const handleBackgroundPointerDown = (event: ReactPointerEvent<SVGRectElement>) => {
    event.preventDefault();
    activePointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    networkSvgRef.current?.setPointerCapture(event.pointerId);

    if (activePointersRef.current.size === 2) {
      beginPinch();
      return;
    }

    interactionRef.current = {
      type: 'pan',
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      viewportX: viewportRef.current.x,
      viewportY: viewportRef.current.y,
    };
  };

  const handleNodePointerDown = (
    entityId: string,
    event: ReactPointerEvent<SVGGElement>,
  ) => {
    event.stopPropagation();
    event.preventDefault();
    const pointerPoint = toSvgPoint(event.clientX, event.clientY);
    if (!pointerPoint) {
      return;
    }

    activePointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    networkSvgRef.current?.setPointerCapture(event.pointerId);

    if (activePointersRef.current.size === 2) {
      beginPinch();
      return;
    }

    const nodePoint = nodePositions[entityId] ?? layout[entityId];
    if (!nodePoint) {
      return;
    }

    interactionRef.current = {
      type: 'node',
      pointerId: event.pointerId,
      entityId,
      offsetX: (pointerPoint.x - viewportRef.current.x) / zoomRef.current - nodePoint.x,
      offsetY: (pointerPoint.y - viewportRef.current.y) / zoomRef.current - nodePoint.y,
    };
  };

  const updateEdgeTooltip = (
    relation: AggregatedRelation,
    clientX: number,
    clientY: number,
  ) => {
    setEdgeTooltip({
      relation,
      x: Math.min(clientX + 18, window.innerWidth - 296),
      y: Math.max(16, clientY + 18),
    });
  };

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

      <PathwayQueryBar
        isLoading={isQuerying}
        hasActiveQuery={Boolean(queryResponse)}
        onSubmit={onQuery}
        onClear={onClearQuery}
      />
      {transientQueryMessage ? <p className="pathway-panel__error">{transientQueryMessage}</p> : null}

      <div className="pathway-panel__content">
        <div ref={networkShellRef} className="pathway-panel__network-shell">
          <svg
            ref={networkSvgRef}
            viewBox={`0 0 ${NETWORK_WIDTH} ${NETWORK_HEIGHT}`}
            className="pathway-panel__network"
            onPointerMove={handleSvgPointerMove}
            onPointerUp={handleSvgPointerUp}
            onPointerCancel={handleSvgPointerCancel}
          >
            <defs>
              <marker
                id="pathway-edge-arrow-dark"
                markerWidth="10"
                markerHeight="10"
                refX="7"
                refY="5"
                orient="auto"
                markerUnits="userSpaceOnUse"
              >
                <path d="M 0 0 L 10 5 L 0 10 z" fill="#364148" />
              </marker>
              <marker
                id="pathway-edge-arrow-green"
                markerWidth="10"
                markerHeight="10"
                refX="7"
                refY="5"
                orient="auto"
                markerUnits="userSpaceOnUse"
              >
                <path d="M 0 0 L 10 5 L 0 10 z" fill="#1f6b45" />
              </marker>
              <marker
                id="pathway-edge-arrow-blue"
                markerWidth="10"
                markerHeight="10"
                refX="7"
                refY="5"
                orient="auto"
                markerUnits="userSpaceOnUse"
              >
                <path d="M 0 0 L 10 5 L 0 10 z" fill="#2457a6" />
              </marker>
              <marker
                id="pathway-edge-arrow-gray"
                markerWidth="10"
                markerHeight="10"
                refX="7"
                refY="5"
                orient="auto"
                markerUnits="userSpaceOnUse"
              >
                <path d="M 0 0 L 10 5 L 0 10 z" fill="#667180" />
              </marker>
              <marker
                id="pathway-edge-bar-red"
                markerWidth="12"
                markerHeight="12"
                refX="9"
                refY="6"
                orient="auto"
                markerUnits="userSpaceOnUse"
              >
                <path d="M 9 0 L 9 12" stroke="#902d2d" strokeWidth="2" />
              </marker>
              <marker
                id="pathway-edge-diamond-slate"
                markerWidth="11"
                markerHeight="11"
                refX="8"
                refY="5.5"
                orient="auto"
                markerUnits="userSpaceOnUse"
              >
                <path d="M 0 5.5 L 4 0 L 8 5.5 L 4 11 z" fill="#556779" />
              </marker>
            </defs>
            <rect
              x={0}
              y={0}
              width={NETWORK_WIDTH}
              height={NETWORK_HEIGHT}
              className="pathway-panel__background-hit"
              onPointerDown={handleBackgroundPointerDown}
            />
            <g transform={`translate(${viewport.x} ${viewport.y}) scale(${zoom})`}>
            {visibleRelations.map((relation) => {
              const source = nodePositions[relation.source_entity_id] ?? layout[relation.source_entity_id];
              const target = nodePositions[relation.target_entity_id] ?? layout[relation.target_entity_id];
              if (!source || !target) {
                return null;
              }

              const dx = target.x - source.x;
              const dy = target.y - source.y;
              const length = Math.max(Math.hypot(dx, dy), 1);
              const sourceRadius = 24;
              const targetRadius = 30;
              const startX = source.x + (dx / length) * sourceRadius;
              const startY = source.y + (dy / length) * sourceRadius;
              const endX = target.x - (dx / length) * targetRadius;
              const endY = target.y - (dy / length) * targetRadius;
              const path = `M ${startX} ${startY} L ${endX} ${endY}`;
              const isSelected = selectedRelationId === relation.relation_id;

              return (
                <g key={relation.relation_id}>
                  <path
                    d={path}
                    className={`${getRelationStyleClass(graph, relation.relation_id)} ${getPathwayRelationInteractionClass(
                      relation.relation_type,
                    )} ${isSelected ? 'pathway-panel__edge--selected' : ''}`}
                    markerEnd={getPathwayRelationMarkerId(relation.relation_type)}
                  />
                  <path
                    d={path}
                    className="pathway-panel__edge-hit"
                    onClick={() => setSelectedRelationId(relation.relation_id)}
                    onPointerEnter={(event) =>
                      updateEdgeTooltip(relation, event.clientX, event.clientY)
                    }
                    onPointerMove={(event) =>
                      updateEdgeTooltip(relation, event.clientX, event.clientY)
                    }
                    onPointerLeave={() => setEdgeTooltip(null)}
                  >
                    <title>{relation.summary}</title>
                  </path>
                </g>
              );
            })}
            {Array.from(visibleEntityIds).map((entityId) => {
              const point = nodePositions[entityId] ?? layout[entityId];
              if (!point) {
                return null;
              }

              return (
                <g
                  key={entityId}
                  transform={`translate(${point.x}, ${point.y})`}
                  className="pathway-panel__node"
                  onPointerDown={(event) => handleNodePointerDown(entityId, event)}
                >
                  <circle r={24} className="pathway-panel__entity" />
                  <text className="pathway-panel__entity-label" textAnchor="middle" y={4}>
                    {getEntityNameById(graph, entityId)}
                  </text>
                </g>
              );
            })}
            </g>
          </svg>
          {edgeTooltip ? (
            (() => {
              const bestEvidence = getBestRelationEvidence(graph, edgeTooltip.relation);
              const evidenceCount = getRelationEvidence(graph, edgeTooltip.relation).length;

              return (
                <div
                  className="pathway-panel__edge-tooltip"
                  style={{ left: edgeTooltip.x, top: edgeTooltip.y }}
                >
                  <strong>{getPathwayRelationTypeLabel(edgeTooltip.relation.relation_type)}</strong>
                  <span>{edgeTooltip.relation.summary}</span>
                  <p>
                    Confidence {Math.round(edgeTooltip.relation.confidence * 100)}%
                    {edgeTooltip.relation.evidence_strength
                      ? ` · ${edgeTooltip.relation.evidence_strength} evidence`
                      : ''}
                  </p>
                  {bestEvidence ? (
                    <>
                      <div className="pathway-panel__edge-tooltip-badges">
                        <span>{formatPathwayEvidenceModality(bestEvidence.evidence_modality)}</span>
                        <span>{bestEvidence.support_class.replace(/_/g, ' ')}</span>
                        <span>{bestEvidence.section}</span>
                      </div>
                      <p className="pathway-panel__edge-tooltip-paper">
                        {bestEvidence.paper_title ?? graph.paper_metadata.title}
                      </p>
                      {bestEvidence.experiment_context ? (
                        <p>{bestEvidence.experiment_context}</p>
                      ) : null}
                      <p>{bestEvidence.supporting_snippet}</p>
                      {evidenceCount > 1 ? (
                        <p className="pathway-panel__edge-tooltip-more">
                          {evidenceCount} supporting evidence items linked to this edge
                        </p>
                      ) : null}
                    </>
                  ) : null}
                </div>
              );
            })()
          ) : null}
        </div>

        <div className="pathway-panel__sidebar">
          <section className="pathway-panel__section">
            <h3>Legend</h3>
            <div className="pathway-panel__legend">
              {PATHWAY_INTERACTION_LEGEND.map((item) => (
                <div key={item.key} className="pathway-panel__legend-item">
                  <span
                    className={`pathway-panel__legend-line ${item.className}`}
                    data-marker-id={item.markerId}
                  />
                  <div>
                    <strong>{item.label}</strong>
                    <span>{item.detail}</span>
                  </div>
                </div>
              ))}
            </div>
          </section>
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
