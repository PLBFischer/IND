# Translational Program Cockpit

Translational Program Cockpit is a graph-based planning workspace for preclinical-to-Phase-1 program design. It combines deterministic scheduling and personnel allocation with graph-grounded, model-backed analysis for acceleration, risk review, evidence querying, grounded chat, and mechanistic pathway exploration.

The product is decision support, not autonomous planning. The graph is user-edited. Scheduling remains deterministic. Model-backed features are constrained by the current graph or supplied literature sources and are intended to support, not replace, program judgment.

## What the App Does

The workspace supports three node types on one canvas:

- `experiment` nodes for schedulable preclinical or regulatory work packages
- `biological_pathway` nodes for literature-backed mechanistic context
- `data` nodes for dataset placeholders and attachments linked to experiments

Core capabilities:

- graph authoring with drag/drop positioning, node editing, and dependency edges
- deterministic scheduling with FastAPI + OR-Tools CP-SAT
- personnel-aware assignment using weekly capacity constraints
- program context tracking for target Phase 1 design, IND strategy, and current week
- controlled acceleration proposals for legal dependency-edge parallelization candidates
- graph-grounded evidence query over experiment and pathway context
- graph-wide risk scoring for active experiment nodes
- grounded chat over the current program graph and derived schedule
- literature-backed pathway extraction from raw text or PMC-linked sources
- deterministic pathway query execution over extracted mechanistic relations
- local persistence and JSON import/export for mixed graph workspaces

## Product Model

### Deterministic parts

These parts are implemented without model discretion:

- schedule generation
- personnel assignment
- graph import normalization
- local persistence
- pathway relation filtering, admission, and query execution rules

### Model-backed parts

These features require `OPENAI_API_KEY` on the backend:

- acceleration proposals
- risk scans
- grounded chat
- evidence queries
- pathway extraction, aggregation, duplicate-entity review, and query planning

The backend refuses those requests when no API key is configured.

## Tech Stack

- Frontend: React 18, TypeScript, Vite
- Backend: FastAPI, Pydantic, Uvicorn
- Scheduling engine: OR-Tools CP-SAT
- Model integration: OpenAI Python SDK
- Testing: Vitest, Testing Library, pytest

## Repository Layout

- [`src/App.tsx`](/Users/paolofischer/Desktop/work/test/src/App.tsx)
  Frontend orchestration for graph state, scheduling, acceleration, evidence query, risk scan, pathway build/query, import/export, and editor state.
- [`src/hooks/useLocalStorageGraph.ts`](/Users/paolofischer/Desktop/work/test/src/hooks/useLocalStorageGraph.ts)
  Default demo graph, localStorage persistence, graph normalization, and backward compatibility for older payloads.
- [`src/components/`](/Users/paolofischer/Desktop/work/test/src/components)
  Canvas, editors, toolbar, timeline, chat, evidence, acceleration, and pathway UI.
- [`src/types/graph.ts`](/Users/paolofischer/Desktop/work/test/src/types/graph.ts)
  Shared frontend graph, schedule, acceleration, risk, chat, and evidence types.
- [`src/types/pathway.ts`](/Users/paolofischer/Desktop/work/test/src/types/pathway.ts)
  Pathway extraction, entity, evidence, relation, sanity, and query response types.
- [`backend/app.py`](/Users/paolofischer/Desktop/work/test/backend/app.py)
  FastAPI app, schedule solver, graph context builders, OpenAI-backed analysis endpoints, literature fetching, and pathway processing pipeline.
- [`backend/pathway_models.py`](/Users/paolofischer/Desktop/work/test/backend/pathway_models.py)
  Pydantic schemas for pathway extraction, aggregation, sanity review, and query results.
- [`backend/pathway_prompts.py`](/Users/paolofischer/Desktop/work/test/backend/pathway_prompts.py)
  Prompt templates for pathway extraction, curation, duplicate review, and query planning.
- [`backend/tests/test_app.py`](/Users/paolofischer/Desktop/work/test/backend/tests/test_app.py)
  Backend tests.
- [`example_translational_program_graph.json`](/Users/paolofischer/Desktop/work/test/example_translational_program_graph.json)
  Compact translational program demo graph.
- [`example_translational_pathway_graph.json`](/Users/paolofischer/Desktop/work/test/example_translational_pathway_graph.json)
  Mixed program/pathway demo graph.

## Requirements

- Node.js 18+ recommended
- Python 3.11+ recommended
- npm
- a local Python virtual environment at `.venv`

## Setup

Install frontend dependencies:

```bash
npm install
```

Create a virtual environment and install backend dependencies:

```bash
python3 -m venv .venv
.venv/bin/pip install -r backend/requirements.txt
```

## Environment Variables

The backend loads `.env` automatically from the repository root if the file exists.

Common variables:

- `OPENAI_API_KEY`
  Required for all model-backed features.
- `OPENAI_ACCELERATE_MODEL`
  Optional override for accelerate proposals.
- `OPENAI_RISK_MODEL`
  Optional override for risk scoring.
- `OPENAI_CHAT_MODEL`
  Optional override for grounded chat.
- `OPENAI_EVIDENCE_MODEL`
  Optional override for evidence query.
- `OPENAI_PATHWAY_EXTRACTION_MODEL`
  Optional override for pathway extraction.
- `NCBI_TOOL_NAME`
  Optional tool name for NCBI requests. Defaults to `pathway_demo`.
- `NCBI_CONTACT_EMAIL`
  Optional contact email for NCBI requests.
- `PATHWAY_FETCH_ALLOW_INSECURE_SSL`
  Optional last-resort fallback for demo environments with broken local TLS trust. Accepts values such as `true`, `1`, or `yes`.
- `VITE_SCHEDULER_API_URL`
  Optional frontend override for the backend base URL. Defaults to `/api`.

Example `.env`:

```bash
OPENAI_API_KEY=your_key_here
OPENAI_CHAT_MODEL=gpt-5.4-2026-03-05
OPENAI_RISK_MODEL=gpt-5.4-2026-03-05
OPENAI_EVIDENCE_MODEL=gpt-5.4-2026-03-05
OPENAI_ACCELERATE_MODEL=gpt-5.4-2026-03-05
OPENAI_PATHWAY_EXTRACTION_MODEL=gpt-5.4-2026-03-05
NCBI_CONTACT_EMAIL=you@example.com
```

## Running the App

Start the backend:

```bash
npm run dev:server
```

Start the frontend in a second terminal:

```bash
npm run dev
```

Default local endpoints:

- frontend: `http://127.0.0.1:5173`
- backend: `http://127.0.0.1:8000`
- health check: `http://127.0.0.1:8000/api/health`

The frontend talks to `/api` and can be pointed at a different backend with `VITE_SCHEDULER_API_URL`.

## Build and Test

Production build:

```bash
npm run build
```

Run all tests:

```bash
npm run test
```

Run frontend tests only:

```bash
npm run test:frontend
```

Run backend tests only:

```bash
npm run test:backend
```

## Main UI Workflows

### 1. Build a program graph

- Use `Add` in the toolbar to create experiment, pathway, or data nodes.
- Connect experiment nodes to model dependencies.
- Link data nodes to experiments.
- Fill program context, personnel, and budget.

### 2. Generate a deterministic schedule

- Click `Assign` to produce a schedule for experiment nodes.
- The backend accounts for dependency ordering, personnel availability, per-node effort, current status, and actual start week.
- Open `Timeline` to inspect the resulting schedule.

### 3. Evaluate acceleration options

- Set a budget.
- Click `Accelerate`.
- The backend proposes only edge-level parallelization candidates that are structurally legal in the current graph.
- Proposals are advisory and remain human-accepted or rejected.

### 4. Query graph evidence

- Open `Query`.
- Ask a graph-grounded evidence question.
- The response includes an answer plus supporting node-level references.

### 5. Review risk

- Risk scoring runs over active experiment nodes.
- The response includes scientific risk, execution risk, overall risk, fragility, drivers, assumptions, and recommendations.
- Risk data is shown in the experiment editor and used for node warning states.

### 6. Use grounded chat

- Chat is grounded on the current graph, program context, and derived schedule.
- Responses can reference nodes in the graph for fast navigation.

### 7. Build and explore pathway graphs

- Add a pathway node.
- Provide either raw text or fetchable literature sources such as `PMCID`, `PMC URL`, or `PubMed URL`.
- Build the pathway graph.
- Query the extracted mechanism graph in natural language.
- Inspect admitted and non-default relations, evidence cards, entity normalization, and sanity notes.

## Data Model Summary

### Experiment nodes

Experiment nodes support fields including:

- title and node type
- objective, procedure summary, success criteria, and decision supported
- results and operational notes
- cost, duration, work hours per week, and eligible operators
- owner, status, actual start week, and blocker priority
- Phase 1 relevance and IND relevance
- evidence references and linked pathway nodes

### Pathway nodes

Pathway nodes support:

- summary and focus terms
- literature source definitions
- build status and extraction errors
- extracted pathway graph
- sanity report
- query history and latest query results
- links back to experiment nodes

### Data nodes

Data nodes support:

- dataset identity and description
- lightweight file attachment metadata
- links back to experiment nodes

## API Surface

Implemented backend endpoints:

- `GET /api/health`
- `POST /api/schedule`
- `POST /api/accelerate/propose`
- `POST /api/risk/scan`
- `POST /api/chat`
- `POST /api/evidence/query`
- `POST /api/pathway/build`
- `POST /api/pathway/query`

Notes:

- CORS is open in the current backend configuration.
- Scheduling only considers experiment nodes.
- Mixed graphs are accepted by analysis endpoints, but deterministic scheduling excludes pathway nodes.

## Import, Export, and Persistence

- The app stores graph state in browser `localStorage`.
- Import accepts graph JSON and normalizes older payloads.
- Export writes the current workspace as JSON.
- Program context, personnel, budget, nodes, and edges are persisted together.

Compatibility behavior includes:

- nodes without `nodeKind` normalize to `experiment`
- legacy `content` maps to `procedureSummary`
- legacy `completed` maps to `status`

## Example Graphs

Use these files to load a demo quickly:

- [`example_translational_program_graph.json`](/Users/paolofischer/Desktop/work/test/example_translational_program_graph.json)
  Compact translational program example with program context, schedulable experiment nodes, evidence references, and mixed status values.
- [`example_translational_pathway_graph.json`](/Users/paolofischer/Desktop/work/test/example_translational_pathway_graph.json)
  Mixed workspace with an experiment node and a linked pathway node for the additive pathway workflow.
- [`example_review_demo_graph.json`](/Users/paolofischer/Desktop/work/test/example_review_demo_graph.json)
  Additional demo payload for graph review and analysis behavior.

## Current Constraints and Design Choices

- The graph is user-authored. Model-backed endpoints do not directly mutate it.
- Scheduling semantics are deterministic and limited to experiment nodes.
- Parallelization is edge-level, not free-form node cloning.
- Pathway extraction is conservative and provenance-heavy rather than exhaustive.
- Pathway relations can be hidden by admission policy or surfaced as non-default evidence when support is weaker or unresolved.
- Data nodes are organizational and do not participate in scheduling.

## Troubleshooting

### Model-backed features fail immediately

Check that:

- `OPENAI_API_KEY` is set in `.env` or the shell environment
- the backend was restarted after changing environment variables

### Pathway fetch fails for PMC content

Try:

- supplying raw text directly for the paper
- confirming the source resolves to a usable PMC article
- setting `NCBI_CONTACT_EMAIL`
- using `PATHWAY_FETCH_ALLOW_INSECURE_SSL=true` only if local TLS trust is broken and this is a controlled demo environment

### Schedule cannot be produced

Typical causes:

- cycles in the experiment dependency graph
- impossible personnel constraints
- inconsistent node definitions

The backend returns diagnostics with scheduling responses when relevant.

## Safety and Intended Use

This repository is a planning and analysis tool for internal decision support. It is not a validated GxP system, not a regulatory submission system, and not an autonomous scientific agent. Scientific, operational, and regulatory decisions still require domain review.
