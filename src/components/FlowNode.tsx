import type { PointerEvent as ReactPointerEvent } from 'react';
import { NODE_HEADER_HEIGHT, NODE_MIN_HEIGHT, NODE_WIDTH } from '../utils/constants';
import { formatMetric } from '../utils/metrics';
import type { FlowNode as FlowNodeType } from '../types/graph';

type FlowNodeProps = {
  node: FlowNodeType;
  selected: boolean;
  connectable: boolean;
  connectingFrom: boolean;
  onSelect: (id: string) => void;
  onPointerDown: (id: string, event: ReactPointerEvent<HTMLButtonElement>) => void;
};

export function FlowNode({
  node,
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
        {node.operators.length > 0 ? (
          <div className="flow-node__operators">
            <span>{node.operators.length > 1 ? 'Operators' : 'Operator'}</span>
            <strong>{node.operators.join(', ')}</strong>
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
              <dd>{formatMetric(node.duration)} days</dd>
            </div>
          </dl>
        )}
      </div>
    </button>
  );
}
