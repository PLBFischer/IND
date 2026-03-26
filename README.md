# Translational Program Cockpit

A graph-based planning and analysis platform for preclinical-to-Phase-1 program design.

The app combines:

- deterministic scheduling with personnel allocation and edge-level dependency parallelization
- controlled acceleration proposals that stay human-in-the-loop
- grounded AI review, chat, evidence query, and risk reasoning
- biological pathway nodes for mechanistic literature evidence exploration
- conservative pathway extraction with provenance, sanity checks, and deterministic filtering
- natural-language graph querying over stored pathway relations
- explicit focus on time, spend, fragility, and Phase 1 / IND coherence

The product is decision support, not autonomous scientific planning. The graph remains human-edited. Deterministic calculations stay deterministic. Model-backed features are schema-constrained and graph-grounded.

## Core Demo Features

- Graph authoring and editing for translational program work packages
- Additive pathway node authoring for literature-backed mechanistic context
- Program-level context for target Phase 1 design and target IND strategy
- Rich experiment nodes covering execution, scientific intent, and clinic-bound relevance
- Derived schedule from FastAPI + OR-Tools CP-SAT
- Controlled acceleration proposals over legal edge-parallelization candidates only
- Graph-wide review for contradictions, weak support, wasted spend, and strategy drift
- Graph-wide risk scoring with scientific, execution, regulatory, coherence, and fragility dimensions
- Deep node reasoning with inspectable assumptions, affected claims, missing evidence, and mitigation options
- Evidence query panel for graph-grounded support and gap analysis
- Pathway build endpoint with section-aware chunking, structured extraction, conservative aggregation, and sanity auditing
- Pathway explorer with inspectable evidence drawer and natural-language structured graph query

## Setup

```bash
npm install
python3 -m venv .venv
.venv/bin/pip install -r backend/requirements.txt
```

If you want model-backed features, set `OPENAI_API_KEY` before starting the backend.

If PMC fetching runs behind a corporate TLS proxy, you can set `PATHWAY_FETCH_ALLOW_INSECURE_SSL=true` as a last-resort demo fallback. Prefer fixing the local trust store instead.

## Run Locally

Backend:

```bash
npm run dev:server
```

Frontend:

```bash
npm run dev
```

Frontend defaults to `http://127.0.0.1:5173` and proxies `/api` to the backend at `http://127.0.0.1:8000`.

Production build:

```bash
npm run build
```

Tests:

```bash
npm run test
```

## Demo Payload

Import [`example_translational_program_graph.json`](/Users/paolofischer/Desktop/work/test/example_translational_program_graph.json) to load a compact translational-program example with:

- program-level Phase 1 and IND context
- richer node schema fields
- evidence references
- a mix of completed, in-progress, planned, and blocked work

The example is demo-oriented and plausible, but it is not a real regulatory package.

Import [`example_translational_pathway_graph.json`](/Users/paolofischer/Desktop/work/test/example_translational_pathway_graph.json) to load a small mixed workspace that includes:

- one experiment node plus one linked biological pathway node
- raw-text pathway source fallback for demo-safe extraction
- the additive pathway workflow without changing scheduling semantics

## Architecture Notes

- [`backend/app.py`](/Users/paolofischer/Desktop/work/test/backend/app.py)
  FastAPI app with OR-Tools scheduling plus schema-constrained OpenAI endpoints for chat, review, risk, deep reasoning, evidence query, controlled acceleration, and pathway build/query.
- [`backend/pathway_models.py`](/Users/paolofischer/Desktop/work/test/backend/pathway_models.py)
  Pydantic models for pathway extraction, aggregation, sanity auditing, and deterministic query responses.
- [`backend/pathway_prompts.py`](/Users/paolofischer/Desktop/work/test/backend/pathway_prompts.py)
  Conservative extraction, aggregation, query-planning, and sanity-check prompts.
- [`src/App.tsx`](/Users/paolofischer/Desktop/work/test/src/App.tsx)
  Top-level orchestration for experiment planning plus the additive pathway editor/explorer workflow.
- [`src/hooks/useLocalStorageGraph.ts`](/Users/paolofischer/Desktop/work/test/src/hooks/useLocalStorageGraph.ts)
  Backward-compatible localStorage/import normalization boundary for old experiment payloads and mixed experiment/pathway payloads.
- [`src/types/graph.ts`](/Users/paolofischer/Desktop/work/test/src/types/graph.ts)
  Shared frontend graph types, now with discriminated experiment/pathway nodes.
- [`src/types/pathway.ts`](/Users/paolofischer/Desktop/work/test/src/types/pathway.ts)
  Frontend pathway graph, evidence, sanity, and query types.

## Compatibility Notes

- Older graph payloads still load through normalization.
- Nodes without `nodeKind` still normalize to schedulable experiment nodes.
- Legacy `content` maps into canonical `procedureSummary`.
- Legacy `completed` maps into canonical `status`.
- Import/export now persists the program context alongside nodes, edges, personnel, and budget.
- Pathway nodes live on the same canvas but are excluded from deterministic scheduling, acceleration, personnel assignment, and dependency parallelization.

## Deliberate Non-Changes

- Scheduling semantics are still handled by the existing CP-SAT engine.
- Parallelization is still edge-level, not node-level.
- The model cannot directly edit the graph.
- Acceleration remains accept/reject/stop with human control over every proposed change.
- Pathway extraction is conservative and inspectable, not comprehensive or autonomous scientific reasoning.
