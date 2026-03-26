import type { AggregatedRelation, PathwayGraph } from '../types/pathway';
import { getRelationEvidence } from '../utils/pathway';

type PathwayEvidenceDrawerProps = {
  graph: PathwayGraph;
  relation: AggregatedRelation | null;
  onClose: () => void;
};

export function PathwayEvidenceDrawer({
  graph,
  relation,
  onClose,
}: PathwayEvidenceDrawerProps) {
  if (!relation) {
    return (
      <aside className="pathway-evidence-drawer pathway-evidence-drawer--empty">
        <p>Select a relation to inspect evidence.</p>
      </aside>
    );
  }

  const evidence = getRelationEvidence(graph, relation);

  return (
    <aside className="pathway-evidence-drawer">
      <div className="pathway-evidence-drawer__header">
        <div>
          <span className="toolbar__eyebrow">Evidence Drawer</span>
          <h3>{relation.summary}</h3>
        </div>
        <button type="button" className="icon-button" onClick={onClose}>
          Close
        </button>
      </div>

      <div className="pathway-evidence-drawer__meta">
        <span>{relation.relation_type}</span>
        <span>{relation.support_class ?? 'structural'}</span>
        <span>{relation.evidence_strength ?? 'n/a'}</span>
        <span>{relation.confidence.toFixed(2)}</span>
      </div>

      {evidence.length === 0 ? (
        <p className="pathway-evidence-drawer__empty">No evidence cards were retained for this relation.</p>
      ) : (
        <div className="pathway-evidence-drawer__cards">
          {evidence.map((item) => (
            <article key={item.evidence_id} className="pathway-evidence-drawer__card">
              <div className="pathway-evidence-drawer__badges">
                <span>{item.section}</span>
                <span>{item.support_class}</span>
                <span>{item.evidence_modality}</span>
              </div>
              <p>{item.supporting_snippet}</p>
              {item.experiment_context ? (
                <p className="pathway-evidence-drawer__context">{item.experiment_context}</p>
              ) : null}
              <small>
                {item.paper_title ?? graph.paper_metadata.title} · confidence {item.confidence.toFixed(2)}
              </small>
            </article>
          ))}
        </div>
      )}
    </aside>
  );
}
