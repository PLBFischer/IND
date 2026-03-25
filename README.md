# Translational Program Cockpit

A graph-based planning and analysis platform for preclinical-to-Phase-1 program design.

The app combines:

- deterministic scheduling with personnel allocation and edge-level dependency parallelization
- controlled acceleration proposals that stay human-in-the-loop
- grounded AI review, chat, evidence query, and risk reasoning
- explicit focus on time, spend, fragility, and Phase 1 / IND coherence

The product is decision support, not autonomous scientific planning. The graph remains human-edited. Deterministic calculations stay deterministic. Model-backed features are schema-constrained and graph-grounded.

## Core Demo Features

- Graph authoring and editing for translational program work packages
- Program-level context for target Phase 1 design and target IND strategy
- Rich experiment nodes covering execution, scientific intent, and clinic-bound relevance
- Derived schedule from FastAPI + OR-Tools CP-SAT
- Controlled acceleration proposals over legal edge-parallelization candidates only
- Graph-wide review for contradictions, weak support, wasted spend, and strategy drift
- Graph-wide risk scoring with scientific, execution, regulatory, coherence, and fragility dimensions
- Deep node reasoning with inspectable assumptions, affected claims, missing evidence, and mitigation options
- Evidence query panel for graph-grounded support and gap analysis

## Setup

```bash
npm install
python3 -m venv .venv
.venv/bin/pip install -r backend/requirements.txt
```

If you want model-backed features, set `OPENAI_API_KEY` before starting the backend.

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

## Architecture Notes

- [`backend/app.py`](/Users/paolofischer/Desktop/work/test/backend/app.py)
  FastAPI app with OR-Tools scheduling plus schema-constrained OpenAI endpoints for chat, review, risk, deep reasoning, evidence query, and controlled acceleration.
- [`src/App.tsx`](/Users/paolofischer/Desktop/work/test/src/App.tsx)
  Top-level orchestration for graph state, derived schedule, API requests, and workspace panels.
- [`src/hooks/useLocalStorageGraph.ts`](/Users/paolofischer/Desktop/work/test/src/hooks/useLocalStorageGraph.ts)
  Backward-compatible localStorage/import normalization boundary for old and new graph payloads.
- [`src/types/graph.ts`](/Users/paolofischer/Desktop/work/test/src/types/graph.ts)
  Shared frontend graph, review, risk, and evidence types.

## Compatibility Notes

- Older graph payloads still load through normalization.
- Legacy `content` maps into canonical `procedureSummary`.
- Legacy `completed` maps into canonical `status`.
- Import/export now persists the program context alongside nodes, edges, personnel, and budget.

## Deliberate Non-Changes

- Scheduling semantics are still handled by the existing CP-SAT engine.
- Parallelization is still edge-level, not node-level.
- The model cannot directly edit the graph.
- Acceleration remains accept/reject/stop with human control over every proposed change.
