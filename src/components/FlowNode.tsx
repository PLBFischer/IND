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
  const effectiveCost = getEffectiveNodeCost(node, edges);
  const effectiveWorkHoursPerWeek = getEffectiveNodeWorkHoursPerWeek(node, edges);
  const effectiveParallelizationMultiplier = getEffectiveParallelizationMultiplier(
    node,
    edges,
  );
  const isActive = isActiveNodeStatus(node.status);
  const className = [
    'flow-node',
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
          <span className="flow-node__badge">{getNodeTypeLabel(node.type)}</span>
          <span className="flow-node__badge flow-node__badge--priority">
            {getBlockerPriorityLabel(node.blockerPriority)}
          </span>
          <span className={`flow-node__badge flow-node__badge--status flow-node__badge--${node.status}`}>
            {getNodeStatusLabel(node.status)}
          </span>
        </div>
        <p>{getNodeCardSummary(node)}</p>
        {scheduleNode ? (
          <div className="flow-node__operators">
            <span>Assignment</span>
            <strong>
              {scheduleNode.usesPersonnel
                ? scheduleNode.assignedOperator ?? 'Unassigned'
                : 'No operator required'}
            </strong>
          </div>
        ) : null}
        {isActive ? (
          <dl className="flow-node__metrics">
            <div>
              <dt>Cost</dt>
              <dd>${formatMetric(effectiveCost)}</dd>
            </div>
            <div>
              <dt>Duration</dt>
              <dd>{formatMetric(node.duration)} weeks</dd>
            </div>
            <div>
              <dt>Workload</dt>
              <dd>{formatMetric(effectiveWorkHoursPerWeek)} hrs/wk</dd>
            </div>
          </dl>
        ) : (
          <div className="flow-node__status">{getNodeStatusLabel(node.status)}</div>
        )}
      </div>
    </button>
  );
}
