import { useMemo, useState } from 'react';
import type { ExperimentNode, ScheduleResult } from '../types/graph';
import { NODE_TYPE_LABELS, NODE_TYPE_OPTIONS } from '../types/graph';
import { formatMetric } from '../utils/metrics';

type TimelinePanelProps = {
  isOpen: boolean;
  currentWeek: number;
  nodes: ExperimentNode[];
  schedule: ScheduleResult | null;
  isLoading: boolean;
  onClose: () => void;
};

type TimelineRow = {
  node: ExperimentNode;
  startWeek: number;
  endWeek: number;
  durationWeeks: number;
};

const TYPE_ORDER = NODE_TYPE_OPTIONS;

export function TimelinePanel({
  isOpen,
  currentWeek,
  nodes,
  schedule,
  isLoading,
  onClose,
}: TimelinePanelProps) {
  const [collapsedTypes, setCollapsedTypes] = useState<string[]>([]);

  const rowsByType = useMemo(() => {
    if (!schedule) {
      return new Map<string, TimelineRow[]>();
    }

    const scheduleByNodeId = new Map(schedule.nodes.map((entry) => [entry.nodeId, entry]));
    const next = new Map<string, TimelineRow[]>();

    for (const node of nodes) {
      if (node.status === 'canceled' || node.status === 'completed' || node.status === 'failed') {
        continue;
      }

      const scheduled = scheduleByNodeId.get(node.id);
      if (!scheduled) {
        continue;
      }

      const startWeek = Math.max(1, Math.floor(scheduled.start) + 1);
      const endWeek = Math.max(startWeek, Math.ceil(scheduled.finish));
      const row: TimelineRow = {
        node,
        startWeek,
        endWeek,
        durationWeeks: Math.max(0, scheduled.finish - scheduled.start),
      };
      const existing = next.get(node.type) ?? [];
      existing.push(row);
      next.set(node.type, existing);
    }

    for (const [type, rows] of next.entries()) {
      next.set(
        type,
        rows.sort((left, right) => {
          if (left.startWeek !== right.startWeek) {
            return left.startWeek - right.startWeek;
          }
          return left.node.title.localeCompare(right.node.title);
        }),
      );
    }

    return next;
  }, [nodes, schedule]);

  const visibleTypes = TYPE_ORDER.filter((type) => (rowsByType.get(type)?.length ?? 0) > 0);
  const maxEndWeek = Math.max(
    currentWeek,
    ...visibleTypes.flatMap((type) => rowsByType.get(type)?.map((row) => row.endWeek) ?? []),
  );
  const weekNumbers = Array.from({ length: Math.max(1, maxEndWeek) }, (_, index) => index + 1);

  if (!isOpen) {
    return null;
  }

  return (
    <aside className="timeline-panel" aria-label="Planned experiment timeline">
      <div className="timeline-panel__header">
        <div>
          <span className="toolbar__eyebrow">Timeline</span>
          <h2>Planned Experiment Gantt</h2>
        </div>
        <button type="button" className="icon-button" onClick={onClose}>
          Collapse
        </button>
      </div>

      {isLoading ? <p className="timeline-panel__empty">Refreshing the current schedule.</p> : null}
      {!isLoading && !schedule ? (
        <p className="timeline-panel__empty">Open the timeline or run Assign to generate a schedule.</p>
      ) : null}
      {!isLoading && schedule && visibleTypes.length === 0 ? (
        <p className="timeline-panel__empty">No active non-canceled experiments are available for the timeline.</p>
      ) : null}

      {schedule && visibleTypes.length > 0 ? (
        <div className="timeline-panel__body">
          <div
            className="timeline-panel__grid timeline-panel__grid--header"
            style={{ gridTemplateColumns: `240px repeat(${weekNumbers.length}, minmax(44px, 1fr))` }}
          >
            <div className="timeline-panel__sticky">
              Current week {currentWeek} | Planned duration {formatMetric(schedule.makespan)} weeks
            </div>
            {weekNumbers.map((week) => (
              <div
                key={week}
                className={`timeline-panel__week ${week === currentWeek ? 'timeline-panel__week--current' : ''}`}
              >
                {week}
              </div>
            ))}
          </div>

          {visibleTypes.map((type) => {
            const rows = rowsByType.get(type) ?? [];
            const isCollapsed = collapsedTypes.includes(type);

            return (
              <section key={type} className="timeline-panel__section">
                <button
                  type="button"
                  className="timeline-panel__section-toggle"
                  onClick={() =>
                    setCollapsedTypes((current) =>
                      current.includes(type)
                        ? current.filter((entry) => entry !== type)
                        : [...current, type],
                    )
                  }
                >
                  <span>{NODE_TYPE_LABELS[type]}</span>
                  <strong>{rows.length}</strong>
                </button>

                {!isCollapsed ? (
                  rows.map((row) => {
                    const span = Math.max(1, row.endWeek - row.startWeek + 1);

                    return (
                      <div
                        key={row.node.id}
                        className="timeline-panel__grid timeline-panel__row"
                        style={{
                          gridTemplateColumns: `240px repeat(${weekNumbers.length}, minmax(44px, 1fr))`,
                        }}
                      >
                        <div className="timeline-panel__sticky timeline-panel__row-label">
                          <strong>{row.node.title}</strong>
                          <span>
                            {row.node.status.replace('_', ' ')} | week {row.startWeek}-{row.endWeek}
                          </span>
                        </div>
                        <div
                          className={`timeline-panel__bar timeline-panel__bar--${row.node.status}`}
                          style={{
                            gridColumn: `${row.startWeek + 1} / span ${span}`,
                          }}
                          title={`${row.node.title}: week ${row.startWeek} to ${row.endWeek}`}
                        >
                          {formatMetric(row.durationWeeks)} wk
                        </div>
                      </div>
                    );
                  })
                ) : null}
              </section>
            );
          })}
        </div>
      ) : null}
    </aside>
  );
}
