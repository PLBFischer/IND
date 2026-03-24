import type { PointerEvent as ReactPointerEvent } from 'react';
import { NODE_HEADER_HEIGHT, NODE_MIN_HEIGHT, NODE_WIDTH } from '../utils/constants';
import { formatMetric } from '../utils/metrics';
import type { FlowNode as FlowNodeType, ScheduledNode } from '../types/graph';

type FlowNodeProps = {
  node: FlowNodeType;
  scheduleNode: ScheduledNode | null;
  selected: boolean;
  connectable: boolean;
  connectingFrom: boolean;
  onSelect: (id: string) => void;
  onPointerDown: (id: string, event: ReactPointerEvent<HTMLButtonElement>) => void;
};

export function FlowNode({
  node,
  scheduleNode,
  selected,
  connectable,
  connectingFrom,
  onSelect,
  onPointerDown,
}: FlowNodeProps) {
  const className = [
    'flow-node',
    selected ? 'flow-node--selected' : '',
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
      </div>
      <div className="flow-node__body">
        <p>{node.content}</p>
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
        {node.completed ? (
          <div className="flow-node__status">Completed</div>
        ) : (
          <dl className="flow-node__metrics">
            <div>
              <dt>Cost</dt>
              <dd>${formatMetric(node.cost)}</dd>
            </div>
            <div>
              <dt>Duration</dt>
              <dd>{formatMetric(node.duration)} weeks</dd>
            </div>
            <div>
              <dt>Workload</dt>
              <dd>{formatMetric(node.workHoursPerWeek)} hrs/wk</dd>
            </div>
          </dl>
        )}
      </div>
    </button>
  );
}
