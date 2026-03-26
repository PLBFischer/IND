import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { BiologicalPathwayNode } from '../types/graph';
import { PathwayPanel } from './PathwayPanel';

const node: BiologicalPathwayNode = {
  id: 'path_1',
  nodeKind: 'biological_pathway',
  title: 'TNF pathway',
  summary: 'Mechanistic TNF support.',
  focusTerms: ['TNF', 'NF-kB'],
  paperSources: [],
  extractionStatus: 'ready',
  extractionError: null,
  pathwayGraph: {
    paper_metadata: {
      title: 'Demo paper',
      pubmed_id: null,
      pmcid: null,
      doi: null,
    },
    entity_mentions: [],
    evidence_items: [
      {
        evidence_id: 'EV1',
        paper_title: 'Demo paper',
        chunk_id: 'chunk_1',
        section: 'Results',
        source_mention_id: 'M1',
        target_mention_id: 'M2',
        source_entity_name: 'TNF',
        target_entity_name: 'NF-kB',
        relation_type: 'activates',
        relation_category: 'interaction',
        assertion_status: 'explicit',
        direction: 'source_to_target',
        support_class: 'current_paper_direct',
        mechanistic_status: 'direct',
        evidence_modality: 'in_vivo',
        species_or_system: 'mouse',
        experiment_context: 'In vivo challenge model',
        intervention: null,
        measured_endpoint: null,
        effect_direction: 'activate',
        supporting_snippet: 'TNF increased NF-kB activation in vivo.',
        is_from_current_paper: true,
        is_primary_result: true,
        figure_or_table_ref: null,
        cited_reference_numbers: [],
        confidence: 0.9,
        short_rationale: 'Primary result.',
      },
    ],
    normalized_entities: [
      {
        entity_id: 'E1',
        canonical_name: 'TNF',
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
        entity_id: 'E2',
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
        entity_id: 'E3',
        canonical_name: 'TNF target gene',
        entity_type: 'gene',
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
        evidence_ids: ['EV1'],
        summary: 'TNF activates NF-kB.',
        notes: '',
      },
      {
        relation_id: 'R2',
        source_entity_id: 'E2',
        target_entity_id: 'E3',
        relation_type: 'regulates_expression',
        relation_category: 'interaction',
        assertion_status: 'explicit',
        direction: 'source_to_target',
        support_class: 'current_paper_direct',
        mechanistic_status: 'indirect',
        evidence_strength: 'strong',
        confidence: 0.88,
        evidence_ids: ['EV1'],
        summary: 'NF-kB regulates expression of TNF target gene.',
        notes: '',
      },
    ],
    structural_relations: [],
    nondefault_relations: [],
    normalization_decisions: [],
    unresolved_issues: [],
  },
  sanityReport: {
    sanity_findings: [],
    summary: {
      overall_graph_quality: 'good',
      high_priority_issue_count: 0,
      notes: 'No major issues.',
    },
  },
  queryHistory: [],
  lastBuiltAt: null,
  linkedExperimentNodeIds: [],
  lastBuildResponse: null,
  latestQueryResponse: null,
  x: 0,
  y: 0,
};

describe('PathwayPanel', () => {
  it('renders the minimal node-type legend', () => {
    render(
      <PathwayPanel
        node={node}
        isOpen
        isQuerying={false}
        queryError={null}
        queryResponse={null}
        onClose={vi.fn()}
        onQuery={vi.fn()}
        onClearQuery={vi.fn()}
      />,
    );

    expect(screen.getByText('Node Types')).toBeInTheDocument();
    expect(screen.getByText('Protein')).toBeInTheDocument();
    expect(screen.getByText('Small Molecule')).toBeInTheDocument();
    expect(screen.getByText('Gene')).toBeInTheDocument();
    expect(screen.getByText('Cell State')).toBeInTheDocument();
    expect(screen.getByText('Phenotype')).toBeInTheDocument();
  });

  it('shows the relation tooltip without the old sidebar sections', () => {
    const { container } = render(
      <PathwayPanel
        node={node}
        isOpen
        isQuerying={false}
        queryError={null}
        queryResponse={null}
        onClose={vi.fn()}
        onQuery={vi.fn()}
        onClearQuery={vi.fn()}
      />,
    );

    const edgeHitArea = container.querySelector('.pathway-panel__edge-hit');
    expect(edgeHitArea).not.toBeNull();

    fireEvent.pointerEnter(edgeHitArea as Element, {
      clientX: 160,
      clientY: 200,
    });

    expect(screen.getByText('activates')).toBeInTheDocument();
    expect(screen.getByText('TNF activates NF-kB · strong evidence')).toBeInTheDocument();
    expect(screen.getByText('Demo paper')).toBeInTheDocument();
    expect(screen.getByText('in vivo')).toBeInTheDocument();
    expect(screen.getByText('In vivo challenge model')).toBeInTheDocument();
    expect(screen.getByText('"TNF increased NF-kB activation in vivo."')).toBeInTheDocument();
    expect(screen.getByText('Edge Legend')).toBeInTheDocument();
    expect(screen.getByText('Activates')).toBeInTheDocument();
    expect(screen.getByText('Inhibits')).toBeInTheDocument();
    expect(screen.queryByText('Sanity')).not.toBeInTheDocument();
    expect(screen.queryByText('Visible Relations')).not.toBeInTheDocument();
  });

  it('shows a clear-query control when a query response is active', () => {
    const { container } = render(
      <PathwayPanel
        node={node}
        isOpen
        isQuerying={false}
        queryError={null}
        queryResponse={{
          query_status: 'ok',
          query_plan: {
            query_intent: 'direct_relation',
            search_mode: 'direct_only',
            max_hops: 1,
          },
          resolved_entities: [],
          subgraph_entity_ids: ['E1', 'E2'],
          subgraph_relation_ids: ['R1'],
          evidence_cards: [],
          answer_summary: 'Retrieved 1 relation.',
          notes: [],
        }}
        onClose={vi.fn()}
        onQuery={vi.fn()}
        onClearQuery={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: 'Show Full Network' })).toBeInTheDocument();
    expect(screen.getByText('TNF target gene')).toBeInTheDocument();
    expect(container.querySelectorAll('.pathway-panel__entity-label--dimmed').length).toBeGreaterThan(0);
    expect(container.querySelectorAll('.pathway-panel__edge--dimmed').length).toBeGreaterThan(0);
  });
});
