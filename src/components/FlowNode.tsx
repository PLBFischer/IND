import type { PointerEvent as ReactPointerEvent } from 'react';
import { NODE_HEADER_HEIGHT, NODE_MIN_HEIGHT, NODE_WIDTH } from '../utils/constants';
import {
  getBlockerPriorityLabel,
  getEffectiveNodeCost,
  getEffectiveNodeWorkHoursPerWeek,
  getEffectiveParallelizationMultiplier,
  getNodeCardSummary,
  getNodeStatusLabel,
  getNodeTypeLabel,
  isExperimentNode,
  isActiveNodeStatus,
} from '../utils/graph';
import { formatMetric } from '../utils/metrics';
import type { FlowEdge, FlowNode as FlowNodeType, ScheduledNode } from '../types/graph';

type FlowNodeProps = {
  node: FlowNodeType;
  edges: FlowEdge[];
  scheduleNode: ScheduledNode | null;
  warningLevel: 'warning' | 'critical' | null;
  warningLabel: string | null;
  selected: boolean;
  highlighted: boolean;
  connectable: boolean;
  connectingFrom: boolean;
  onSelect: (id: string) => void;
  onPointerDown: (id: string, event: ReactPointerEvent<HTMLButtonElement>) => void;
};

export function FlowNode({
  node,
  edges,
  scheduleNode,
  warningLevel,
  warningLabel,
  selected,
  highlighted,
  connectable,
  connectingFrom,
  onSelect,
  onPointerDown,
}: FlowNodeProps) {
  const isExperiment = isExperimentNode(node);
  const effectiveCost = isExperiment ? getEffectiveNodeCost(node, edges) : null;
  const effectiveWorkHoursPerWeek = isExperiment
    ? getEffectiveNodeWorkHoursPerWeek(node, edges)
    : null;
  const effectiveParallelizationMultiplier = isExperiment
    ? getEffectiveParallelizationMultiplier(node, edges)
    : 1;
  const isActive = isExperiment ? isActiveNodeStatus(node.status) : false;
  const className = [
    'flow-node',
    isExperiment ? '' : 'flow-node--pathway',
    selected ? 'flow-node--selected' : '',
    highlighted ? 'flow-node--highlighted' : '',
    connectable ? 'flow-node--connectable' : '',
    connectingFrom ? 'flow-node--source' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <button
      type="button"
      className={className}
      style={{
        left: node.x,
        top: node.y,
        width: NODE_WIDTH,
        minHeight: NODE_MIN_HEIGHT,
      }}
      onClick={(event) => {
        event.stopPropagation();
        onSelect(node.id);
      }}
      onPointerDown={(event) => {
        event.stopPropagation();
        onPointerDown(node.id, event);
      }}
    >
      <div className="flow-node__header" style={{ height: NODE_HEADER_HEIGHT }}>
        <span>{node.title}</span>
        <div className="flow-node__header-meta">
          {warningLevel ? (
            <span
              className={`flow-node__warning-badge flow-node__warning-badge--${warningLevel}`}
              title={warningLabel ?? undefined}
              aria-label={warningLabel ?? undefined}
            >
              !
            </span>
          ) : null}
          {effectiveParallelizationMultiplier > 1 ? (
            <span className="flow-node__multiplier">{effectiveParallelizationMultiplier}x</span>
          ) : null}
        </div>
      </div>
      <div className="flow-node__body">
        <div className="flow-node__badges">
          {isExperiment ? (
            <>
              <span className="flow-node__badge">{getNodeTypeLabel(node.type)}</span>
              <span className="flow-node__badge flow-node__badge--priority">
                {getBlockerPriorityLabel(node.blockerPriority)}
              </span>
              <span
                className={`flow-node__badge flow-node__badge--status flow-node__badge--${node.status}`}
              >
                {getNodeStatusLabel(node.status)}
              </span>
            </>
          ) : (
            <>
              <span className="flow-node__badge flow-node__badge--pathway">Biological pathway</span>
              <span className="flow-node__badge flow-node__badge--status">
                {node.extractionStatus}
              </span>
            </>
          )}
        </div>
        <p>{getNodeCardSummary(node)}</p>
        {isExperiment && scheduleNode ? (
          <div className="flow-node__operators">
            <span>Assignment</span>
            <strong>
              {scheduleNode.usesPersonnel
                ? scheduleNode.assignedOperator ?? 'Unassigned'
                : 'No operator required'}
            </strong>
          </div>
        ) : null}
        {isExperiment && isActive ? (
          <dl className="flow-node__metrics">
            <div>
              <dt>Cost</dt>
              <dd>${formatMetric(effectiveCost ?? 0)}</dd>
            </div>
            <div>
              <dt>Duration</dt>
              <dd>{formatMetric(node.duration)} weeks</dd>
            </div>
            <div>
              <dt>Workload</dt>
              <dd>{formatMetric(effectiveWorkHoursPerWeek ?? 0)} hrs/wk</dd>
            </div>
          </dl>
        ) : isExperiment ? (
          <div className="flow-node__status">{getNodeStatusLabel(node.status)}</div>
        ) : (
          <dl className="flow-node__metrics flow-node__metrics--pathway">
            <div>
              <dt>Sources</dt>
              <dd>{node.paperSources.length}</dd>
            </div>
            <div>
              <dt>Edges</dt>
              <dd>{node.pathwayGraph?.default_relations.length ?? 0}</dd>
            </div>
            <div>
              <dt>Warnings</dt>
              <dd>{node.sanityReport?.summary.high_priority_issue_count ?? 0}</dd>
            </div>
          </dl>
        )}
      </div>
    </button>
  );
}
