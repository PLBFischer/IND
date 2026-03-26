import { describe, expect, it } from 'vitest';
import type { PathwayGraph } from '../types/pathway';
import { computePathwayLayout } from './pathway';

const graph: PathwayGraph = {
  paper_metadata: {
    title: 'Deterministic layout graph',
    pubmed_id: null,
    pmcid: null,
    doi: null,
  },
  entity_mentions: [],
  evidence_items: [],
  normalized_entities: [
    {
      entity_id: 'E1',
      canonical_name: 'Ligand',
      entity_type: 'small_molecule',
      entity_kind: 'simple_entity',
      aliases: [],
      source_mention_ids: [],
      normalization_status: 'exact_normalized',
      base_entity_id: null,
      component_entity_ids: [],
      notes: '',
    },
    {
      entity_id: 'E2',
      canonical_name: 'Receptor',
      entity_type: 'protein',
      entity_kind: 'simple_entity',
      aliases: [],
      source_mention_ids: [],
      normalization_status: 'exact_normalized',
      base_entity_id: null,
      component_entity_ids: [],
      notes: '',
    },
    {
      entity_id: 'E3',
      canonical_name: 'NF-kB',
      entity_type: 'protein',
      entity_kind: 'simple_entity',
      aliases: [],
      source_mention_ids: [],
      normalization_status: 'exact_normalized',
      base_entity_id: null,
      component_entity_ids: [],
      notes: '',
    },
    {
      entity_id: 'E4',
      canonical_name: 'Cytokine production',
      entity_type: 'phenotype',
      entity_kind: 'simple_entity',
      aliases: [],
      source_mention_ids: [],
      normalization_status: 'exact_normalized',
      base_entity_id: null,
      component_entity_ids: [],
      notes: '',
    },
  ],
  default_relations: [
    {
      relation_id: 'R1',
      source_entity_id: 'E1',
      target_entity_id: 'E2',
      relation_type: 'activates',
      relation_category: 'interaction',
      assertion_status: 'explicit',
      direction: 'source_to_target',
      support_class: 'current_paper_direct',
      mechanistic_status: 'direct',
      evidence_strength: 'strong',
      confidence: 0.9,
      evidence_ids: [],
      summary: 'Ligand activates receptor.',
      notes: '',
    },
    {
      relation_id: 'R2',
      source_entity_id: 'E2',
      target_entity_id: 'E3',
      relation_type: 'activates',
      relation_category: 'interaction',
      assertion_status: 'explicit',
      direction: 'source_to_target',
      support_class: 'current_paper_direct',
      mechanistic_status: 'direct',
      evidence_strength: 'strong',
      confidence: 0.9,
      evidence_ids: [],
      summary: 'Receptor activates NF-kB.',
      notes: '',
    },
    {
      relation_id: 'R3',
      source_entity_id: 'E3',
      target_entity_id: 'E4',
      relation_type: 'activates',
      relation_category: 'interaction',
      assertion_status: 'explicit',
      direction: 'source_to_target',
      support_class: 'current_paper_direct',
      mechanistic_status: 'direct',
      evidence_strength: 'strong',
      confidence: 0.9,
      evidence_ids: [],
      summary: 'NF-kB activates cytokine production.',
      notes: '',
    },
  ],
  structural_relations: [],
  nondefault_relations: [],
  normalization_decisions: [],
  unresolved_issues: [],
};

describe('computePathwayLayout', () => {
  it('produces a deterministic left-to-right layout for connected graphs', () => {
    const entityIds = new Set(graph.normalized_entities.map((entity) => entity.entity_id));

    const firstLayout = computePathwayLayout(graph, entityIds);
    const secondLayout = computePathwayLayout(graph, entityIds);

    expect(firstLayout).toEqual(secondLayout);
    expect(firstLayout.E1.x).toBeLessThan(firstLayout.E2.x);
    expect(firstLayout.E2.x).toBeLessThan(firstLayout.E3.x);
    expect(firstLayout.E3.x).toBeLessThan(firstLayout.E4.x);
  });
});
