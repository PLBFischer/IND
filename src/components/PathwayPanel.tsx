import { useEffect, useMemo, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import type { BiologicalPathwayNode } from '../types/graph';
import type { AggregatedRelation, EntityType } from '../types/pathway';
import type { PathwayQueryResponse } from '../types/pathway';
import {
  PATHWAY_LAYOUT_HEIGHT,
  PATHWAY_LAYOUT_WIDTH,
  PATHWAY_INTERACTION_LEGEND,
  computePathwayLayout,
  formatPathwayEvidenceModality,
  getBestRelationEvidence,
  getPathwayEntityStyle,
  getEntityNameById,
  getRelationEvidence,
  getPathwayRelationInteractionClass,
  getPathwayRelationEdgeLabel,
  getPathwayRelationMarkerId,
  getPathwayRelationTypeLabel,
  getRelationStyleClass,
  getVisiblePathwayEntityIds,
  getVisiblePathwayRelations,
} from '../utils/pathway';
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

const NETWORK_WIDTH = PATHWAY_LAYOUT_WIDTH;
const NETWORK_HEIGHT = PATHWAY_LAYOUT_HEIGHT;
const MIN_ZOOM = 0.6;
const MAX_ZOOM = 2.4;

const getHexagonPoints = (width: number, height: number) => {
  const halfWidth = width / 2;
  const halfHeight = height / 2;
  const shoulder = Math.min(20, width * 0.18);
  return [
    `${-halfWidth + shoulder},${-halfHeight}`,
    `${halfWidth - shoulder},${-halfHeight}`,
    `${halfWidth},0`,
    `${halfWidth - shoulder},${halfHeight}`,
    `${-halfWidth + shoulder},${halfHeight}`,
    `${-halfWidth},0`,
  ].join(' ');
};

const NODE_TYPE_LEGEND: Array<{
  type: EntityType;
  label: string;
  detail: string;
}> = [
  {
    type: 'protein',
    label: 'Protein',
    detail: 'Functional biomolecule',
  },
  {
    type: 'small_molecule',
    label: 'Small Molecule',
    detail: 'Metabolite, messenger, or drug',
  },
  {
    type: 'gene',
    label: 'Gene',
    detail: 'DNA-level transcriptional unit',
  },
  {
    type: 'cell_state',
    label: 'Cell State',
    detail: 'Cell type or cellular context',
  },
  {
    type: 'phenotype',
    label: 'Phenotype',
    detail: 'Higher-level outcome or process',
  },
];

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
  const clearQueryRef = useRef(onClearQuery);

  useEffect(() => {
    clearQueryRef.current = onClearQuery;
  }, [onClearQuery]);

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
    clearQueryRef.current();
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
                id="pathway-edge-arrow"
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
                id="pathway-edge-bar"
                markerWidth="12"
                markerHeight="12"
                refX="9"
                refY="6"
                orient="auto"
                markerUnits="userSpaceOnUse"
              >
                <path d="M 9 0 L 9 12" stroke="#364148" strokeWidth="2" />
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
              const sourceEntity = graph.normalized_entities.find(
                (entity) => entity.entity_id === relation.source_entity_id,
              );
              const targetEntity = graph.normalized_entities.find(
                (entity) => entity.entity_id === relation.target_entity_id,
              );
              if (!source || !target) {
                return null;
              }

              if (!sourceEntity || !targetEntity) {
                return null;
              }

              const dx = target.x - source.x;
              const dy = target.y - source.y;
              const length = Math.max(Math.hypot(dx, dy), 1);
              const sourceStyle = getPathwayEntityStyle(sourceEntity.entity_type);
              const targetStyle = getPathwayEntityStyle(targetEntity.entity_type);
              const sourceRadius = Math.max(sourceStyle.width, sourceStyle.height) / 2;
              const targetRadius = Math.max(targetStyle.width, targetStyle.height) / 2;
              const startX = source.x + (dx / length) * sourceRadius;
              const startY = source.y + (dy / length) * sourceRadius;
              const endX = target.x - (dx / length) * targetRadius;
              const endY = target.y - (dy / length) * targetRadius;
              const reverseRelation = visibleRelations.find(
                (candidate) =>
                  candidate.source_entity_id === relation.target_entity_id &&
                  candidate.target_entity_id === relation.source_entity_id,
              );
              const hasBidirectionalPair = Boolean(
                reverseRelation && relation.source_entity_id !== relation.target_entity_id,
              );
              const curveOffset = hasBidirectionalPair ? 36 : 0;
              const normalX = -dy / length;
              const normalY = dx / length;
              const controlX = (startX + endX) / 2 + normalX * curveOffset;
              const controlY = (startY + endY) / 2 + normalY * curveOffset;
              const path = hasBidirectionalPair
                ? `M ${startX} ${startY} Q ${controlX} ${controlY} ${endX} ${endY}`
                : `M ${startX} ${startY} L ${endX} ${endY}`;
              const label = getPathwayRelationEdgeLabel(relation.relation_type);
              const midX = hasBidirectionalPair ? 0.25 * startX + 0.5 * controlX + 0.25 * endX : (startX + endX) / 2;
              const midY = hasBidirectionalPair ? 0.25 * startY + 0.5 * controlY + 0.25 * endY : (startY + endY) / 2;

              return (
                <g key={relation.relation_id}>
                  <path
                    d={path}
                    className={`${getRelationStyleClass(graph, relation.relation_id)} ${getPathwayRelationInteractionClass(
                      relation.relation_type,
                    )}`}
                    markerEnd={getPathwayRelationMarkerId(relation.relation_type)}
                  />
                  {label ? (
                    <text x={midX} y={midY - 8} textAnchor="middle" className="pathway-panel__edge-label">
                      {label}
                    </text>
                  ) : null}
                  <path
                    d={path}
                    className="pathway-panel__edge-hit"
                    onMouseEnter={(event) =>
                      updateEdgeTooltip(relation, event.clientX, event.clientY)
                    }
                    onMouseMove={(event) =>
                      updateEdgeTooltip(relation, event.clientX, event.clientY)
                    }
                    onMouseLeave={() => setEdgeTooltip(null)}
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
              const entity = graph.normalized_entities.find(
                (candidate) => candidate.entity_id === entityId,
              );
              if (!point) {
                return null;
              }

              if (!entity) {
                return null;
              }

              const style = getPathwayEntityStyle(entity.entity_type);
              const halfWidth = style.width / 2;
              const halfHeight = style.height / 2;

              return (
                <g
                  key={entityId}
                  transform={`translate(${point.x}, ${point.y})`}
                  className="pathway-panel__node"
                  onPointerDown={(event) => handleNodePointerDown(entityId, event)}
                >
                  {style.shape === 'circle' ? (
                    <circle
                      r={style.width / 2}
                      className="pathway-panel__entity"
                      fill={style.fill}
                      stroke={style.stroke}
                    />
                  ) : null}
                  {style.shape === 'rect' || style.shape === 'pill' ? (
                    <rect
                      x={-halfWidth}
                      y={-halfHeight}
                      width={style.width}
                      height={style.height}
                      rx={style.radius ?? 0}
                      ry={style.radius ?? 0}
                      className="pathway-panel__entity"
                      fill={style.fill}
                      stroke={style.stroke}
                    />
                  ) : null}
                  {style.shape === 'hexagon' ? (
                    <polygon
                      points={getHexagonPoints(style.width, style.height)}
                      className="pathway-panel__entity"
                      fill={style.fill}
                      stroke={style.stroke}
                    />
                  ) : null}
                  <text className="pathway-panel__entity-label" textAnchor="middle">
                    <tspan x={0} dy="-0.2em">
                      {getEntityNameById(graph, entityId)}
                    </tspan>
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
            <h3>Edge Legend</h3>
            <div className="pathway-panel__legend">
              {PATHWAY_INTERACTION_LEGEND.map((item) => (
                <div key={item.key} className="pathway-panel__legend-item">
                  <span
                    className={`pathway-panel__legend-line ${item.className}`}
                    data-marker-id={item.markerId}
                    data-edge-label={item.edgeLabel ?? undefined}
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
            <h3>Node Types</h3>
            <div className="pathway-panel__legend">
              {NODE_TYPE_LEGEND.map((item) => {
                const style = getPathwayEntityStyle(item.type);
                return (
                  <div key={item.type} className="pathway-panel__legend-item">
                    <span className="pathway-panel__legend-swatch">
                      {style.shape === 'circle' ? (
                        <svg viewBox="0 0 40 40" aria-hidden="true">
                          <circle
                            cx="20"
                            cy="20"
                            r="10"
                            fill={style.fill}
                            stroke={style.stroke}
                            strokeWidth="1.5"
                          />
                        </svg>
                      ) : null}
                      {style.shape === 'rect' || style.shape === 'pill' ? (
                        <svg viewBox="0 0 40 40" aria-hidden="true">
                          <rect
                            x={style.shape === 'pill' ? 6 : 7}
                            y={style.shape === 'pill' ? 11 : 12}
                            width={style.shape === 'pill' ? 28 : 26}
                            height={style.shape === 'pill' ? 18 : 16}
                            rx={style.shape === 'pill' ? 9 : style.radius ?? 0}
                            ry={style.shape === 'pill' ? 9 : style.radius ?? 0}
                            fill={style.fill}
                            stroke={style.stroke}
                            strokeWidth="1.5"
                          />
                        </svg>
                      ) : null}
                      {style.shape === 'hexagon' ? (
                        <svg viewBox="0 0 40 40" aria-hidden="true">
                          <polygon
                            points="12,10 28,10 34,20 28,30 12,30 6,20"
                            fill={style.fill}
                            stroke={style.stroke}
                            strokeWidth="1.5"
                          />
                        </svg>
                      ) : null}
                    </span>
                    <div>
                      <strong>{item.label}</strong>
                      <span>{item.detail}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        </div>
      </div>
    </aside>
  );
}
