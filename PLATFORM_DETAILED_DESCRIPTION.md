# Translational Program Cockpit

## Purpose Of This Document

This file is an implementation-level description of the project in its current repository state.

It is intended to explain, in one place:

- what the product is now
- how it is positioned
- what the active user experience is
- what the editable data model is
- what is derived versus user-authored
- how scheduling, review, evidence, risk, and acceleration work
- how frontend persistence and normalization behave
- what parts of the original architecture were intentionally preserved
- what current limitations and leftover legacy artifacts still exist

This is not a speculative roadmap. It describes the platform that is actually implemented in this repository today.

## One-Sentence Product Description

This project is a graph-based translational program cockpit that helps a scientist keep a preclinical program on the fastest credible path to Phase 1 while controlling spend and maintaining a coherent IND story.

## Current Product Positioning

The application has moved beyond being a simple flowchart editor with a scheduler. It is now positioned as a decision-support workspace for translational R&D planning, with a specific emphasis on:

- preclinical-to-Phase-1 readiness
- IND coherence
- budget-aware execution
- personnel-aware deterministic scheduling
- inspectable graph-grounded AI reasoning

The product is intentionally not framed as an autonomous research agent. The user remains the editor and owner of the graph. The system analyzes, critiques, schedules, and proposes acceleration moves, but it does not silently mutate the plan.

## Core Product Principles Reflected In The Code

The current platform follows a few very strong design rules.

### 1. The graph is the editable source of truth

What the user explicitly authors:

- program context
- personnel
- budget
- nodes
- edges
- node positions on the canvas

Everything else is computed from that state.

### 2. Deterministic logic stays deterministic

Scheduling and legal acceleration candidate generation are code-driven, not LLM-driven.

The backend still uses OR-Tools CP-SAT for exact scheduling, and legal acceleration moves are still enumerated explicitly before any model is asked to choose among them.

### 3. LLM features are grounded and schema-constrained

Every AI-backed endpoint in the backend uses structured JSON output with validation.

The model is used for:

- review
- evidence query
- graph-wide risk scanning
- deep node reasoning
- choosing among already-legal acceleration candidates
- grounded chat at the backend level

The model is not used for:

- free-form graph mutation
- arbitrary schedule generation
- opaque autonomous execution

### 4. Human control remains explicit

The most important human-in-the-loop behaviors are:

- graph edits happen in the UI only
- acceleration is propose / accept / reject / stop
- risk and review are advisory
- evidence responses cite nodes and snippets
- deep reasoning is inspectable and explicit rather than hidden

### 5. Backward compatibility is handled at the normalization boundary

The code deliberately preserves compatibility with older saved graphs by normalizing legacy shapes into the newer canonical model.

Important legacy mappings:

- old `content` -> canonical `procedureSummary`
- old `completed` -> canonical `status`
- missing `program` -> default program context object

This keeps old localStorage data and old imported JSON payloads from bricking the app.

## Current Product State At A Glance

The current platform includes:

- graph authoring and editing
- node dragging and canvas layout
- directed dependency edges
- edge-level parallelization toggles
- deterministic personnel-aware schedule assignment
- budget-aware acceleration proposals
- graph-wide review
- graph-wide coherence-aware risk scoring
- deep node-level reasoning
- graph-grounded evidence query
- import/export
- localStorage persistence
- backward-compatible normalization
- lightweight automated frontend and backend tests

The active UI no longer exposes Chat as a primary surface. The product now emphasizes Evidence, Review, Risk, and Acceleration as the differentiated workflow surfaces.

## Current User Experience

### Main workspace layout

The UI is centered on a large canvas and a small number of overlay panels.

Current active surfaces:

- top toolbar
- central graph canvas
- left-side collapsible program setup panel
- right-side node editor
- right-side evidence panel
- right-side review panel
- left-side deep reasoning panel
- bottom-right acceleration panel

### Program setup panel

The left-side panel is now the single place for company/program setup information. It consolidates what had previously been more scattered controls.

It currently includes:

- program title
- budget
- target Phase 1 design
- target IND strategy / story
- personnel roster
- personnel weekly capacity editing

This panel can be collapsed to keep the workspace visually cleaner.

### Toolbar

The toolbar is intentionally slimmer than earlier versions.

It currently shows:

- the product brand and title
- `Planned Cost / Budget`
- `Planned Duration`
- `Assign`
- `Accelerate`
- `Evidence`
- `Review`
- `Import`
- `Export`
- `Add Node`

The planned cost display was recently updated so that cost and budget are visually coupled as:

`<Planned Cost> / <Budget>`

This better reflects the product’s framing around spend discipline instead of absolute cost alone.

### Canvas behavior

The canvas supports:

- click-to-select nodes
- drag-to-position nodes
- pointer-based panning
- ctrl/cmd + wheel zoom
- edge rendering
- node highlighting from review/evidence references
- schedule overlays on nodes when assignment view is active

The canvas is intentionally uncluttered. Rich node details live in the side editor, not on the cards themselves.

### Node editor

The node editor is now much more domain-specific than the original version.

It is organized into sections:

- Basics
- Scientific Intent
- Operational Planning
- Results and Evidence
- Program Relevance

It also preserves the risk snapshot and deep reasoning entry point.

### Evidence panel

Evidence is now the primary grounded-query surface in the active UI.

It lets the user ask questions such as:

- Which nodes support brain penetration?
- What evidence currently supports dose selection?
- What is missing for the IND story?
- Which experiments matter most to the target Phase 1 design?

### Review panel

Review is now explicitly about program coherence, not just graph hygiene.

It is intended to catch:

- contradictions
- stale descriptions
- weak support
- mismatched priorities
- orphaned work
- wasted spend
- Phase 1 / IND inconsistencies

### Deep reasoning panel

Deep reasoning remains node-specific and advisory.

It gives an inspectable explanation of why a node is risky, fragile, or strategically incoherent, rather than simply assigning a badge.

### Accelerate panel

Acceleration remains controlled and bounded.

The panel shows a single proposed legal acceleration move at a time and exposes:

- the proposed dependency to parallelize
- the proposed multiplier
- the resulting cost/duration impact
- the model’s rationale
- accept / reject / stop controls

## Current Data Model

The current frontend and backend both operate on a richer canonical graph schema than the older app.

The frontend definitions live in `src/types/graph.ts`.

### Program context

Program-level context is now part of the canonical graph state.

Current fields:

- `programTitle?: string`
- `targetPhase1Design: string`
- `targetIndStrategy: string`

These fields are included in:

- localStorage
- import/export payloads
- backend analysis request payloads

### Personnel

Personnel remains simple by design.

Current shape:

- `name: string`
- `hoursPerWeek: number`

Personnel is used by the deterministic schedule solver and by node operator eligibility.

### Node schema

The current canonical node shape is:

- `id`
- `title`
- `type`
- `objective`
- `procedureSummary`
- `successCriteria`
- `decisionSupported`
- `results`
- `operationalNotes`
- `cost`
- `duration`
- `workHoursPerWeek`
- `parallelizationMultiplier`
- `operators`
- `owner`
- `status`
- `blockerPriority`
- `phase1Relevance`
- `indRelevance`
- `evidenceRefs`
- `x`
- `y`

This is a deliberate evolution from the older minimal node format.

### Node type system

Supported node types are:

- `in_vitro`
- `in_vivo`
- `pk`
- `tox`
- `safety_pharmacology`
- `efficacy`
- `formulation_cmc`
- `bioanalysis`
- `regulatory`
- `vendor`
- `analysis`
- `milestone`
- `other`

This gives the graph just enough domain structure to feel translationally specific without turning the schema into a full ontology.

### Node status model

Supported statuses are:

- `planned`
- `in_progress`
- `blocked`
- `completed`
- `failed`
- `canceled`

The scheduler and planned-cost calculation treat terminal statuses specially.

Terminal statuses are:

- `completed`
- `failed`
- `canceled`

Those nodes are excluded from active scheduling and from active planned cost.

### Blocker priority model

Supported priorities are:

- `critical`
- `supporting`
- `exploratory`

This field is now used across several layers:

- UI badges
- acceleration candidate ranking
- review interpretation
- risk context

### Evidence references

`evidenceRefs` is intentionally lightweight.

It is stored as a string array in the canonical shape, but normalization also accepts a newline-delimited string in older or loosely shaped payloads.

### Edges

Edge semantics remain intentionally minimal and unchanged in spirit.

Current edge shape:

- `id`
- `source`
- `target`
- `parallelized`

Parallelization remains edge-level, not node-level.

That architectural choice was intentionally preserved.

## Editable State Versus Derived State

This distinction is one of the best parts of the current implementation.

### Editable state

User-authored state consists of:

- `program`
- `nodes`
- `edges`
- `personnel`
- `budgetUsd`
- node positions `x` and `y`

### Derived state

Derived state includes:

- schedule result
- schedule diagnostics
- acceleration proposal
- acceleration stop reason
- evidence response
- review findings
- risk assessments
- deep risk analysis

These are not treated as the durable source of truth for the project.

## Persistence, Import, Export, And Normalization

Persistence and normalization are implemented in `src/hooks/useLocalStorageGraph.ts`.

This file is one of the most important frontend files in the repository.

### What it does

It is responsible for:

- reading persisted graph state from localStorage
- normalizing older payloads into the current canonical shape
- providing a default demo state
- auto-persisting current graph state back into localStorage
- exposing state setters for the app shell

### LocalStorage behavior

The graph is persisted under:

- `minimal-flowchart-editor-state`

This is a legacy naming artifact. The product has evolved, but the storage key has not yet been renamed.

### Default graph state

If no localStorage data exists, the hook boots into a demo translational program with:

- Phase 1 context
- IND strategy context
- multiple node types
- personnel
- budget
- a plausible biotech-oriented initial graph

### Legacy compatibility behavior

Normalization currently handles:

- missing program object
- missing new node fields
- legacy `content`
- legacy `completed`
- string-or-array `evidenceRefs`
- string personnel entries in older payloads

### Import behavior

Import currently works by pasting exported JSON into the Import popover.

The import path:

1. parses JSON
2. detects either raw graph payload or wrapped export payload
3. normalizes the graph
4. auto-layouts the graph
5. resets all transient UI and analysis state

The import reset behavior is deliberate and comprehensive. It clears:

- assignment view
- current schedule
- acceleration state
- evidence state
- review state
- risk state
- deep reasoning state
- panel-specific errors
- zoom and viewport

This keeps stale derived state from leaking across imported graphs.

### Export behavior

Exports use a wrapped payload shaped like:

- `storageKey`
- `exportedAt`
- `graph`

Inside `graph`, the export includes:

- `program`
- `nodes`
- `edges`
- `personnel`
- `budgetUsd`

## Auto Layout

`autoLayoutGraphState` in `src/hooks/useLocalStorageGraph.ts` provides a lightweight deterministic layout for imported graphs.

It:

- computes graph depth from dependencies
- groups nodes into layers
- sorts nodes within layers
- places them on a large canvas grid

It also prefers to place completed nodes earlier within ties, which helps imported graphs remain legible.

This is not a full force-directed layout engine. It is a practical deterministic layout pass optimized for readability and demo stability.

## Frontend File-By-File Implementation Map

### `src/App.tsx`

This is the orchestration layer for the entire frontend application.

It owns:

- graph state hookup
- selection state
- editor mode
- assignment state
- acceleration state
- evidence state
- review state
- graph-wide risk state
- deep risk state
- canvas zoom/pan/drag state
- import/export reset logic

It also builds the request payloads used for backend calls.

Two implementation details here are especially important.

#### 1. Separate schedule and analysis payload builders

`buildScheduleRequestGraph(...)` builds the schedule payload from schedule-relevant fields only.

`buildAnalysisGraph(...)` builds the analysis payload by adding program context on top of the schedule-safe graph shape.

This matters because:

- schedule does not need layout state
- analysis does not need layout state
- only analysis needs program context

#### 2. Layout-only changes no longer retrigger schedule or graph-wide risk

This was an important recent fix.

Previously, dragging a node changed `x` and `y`, which changed the payload signatures used by schedule and risk effects, which in turn caused:

- unnecessary schedule recomputation
- unnecessary graph-wide risk rescans

The current implementation fixes this by excluding layout-only fields from the schedule and analysis signatures.

That change restored the expected behavior where dragging nodes is just a layout action, not a semantic planning change.

### `src/types/graph.ts`

This file defines the main frontend types and enum-like unions for:

- node types
- node statuses
- blocker priorities
- graph payloads
- schedule responses
- acceleration proposals
- risk assessment shapes
- deep risk shapes
- review findings
- evidence query responses
- editor modes

It is the canonical frontend contract for application state and backend responses.

### `src/hooks/useLocalStorageGraph.ts`

This file is the frontend normalization boundary and local persistence layer.

It also contains:

- the default demo graph
- graph auto-layout
- utility normalizers for legacy payloads

### `src/components/ProgramContextPanel.tsx`

This is the unified left-side program/company setup panel.

It currently:

- summarizes budget, personnel count, Phase 1 context, and IND context
- can collapse/expand
- edits program title
- edits budget
- edits target Phase 1 design
- edits target IND strategy
- adds personnel
- edits personnel hours
- removes personnel

This panel replaced a more fragmented setup experience.

### `src/components/Toolbar.tsx`

This is the compact global action surface.

It reflects the current product framing:

- program metrics
- schedule trigger
- acceleration trigger
- evidence trigger
- review trigger
- import/export
- add node

Chat is no longer exposed here.

### `src/components/Canvas.tsx`

This component renders:

- the scalable canvas surface
- the edge layer
- the set of nodes
- empty-state copy

It receives schedule and warning overlays from `App.tsx` rather than owning those concerns itself.

### `src/components/FlowNode.tsx`

This is the visual node card on the canvas.

Important current behavior:

- shows compact badges only
- shows risk warning badge when relevant
- shows effective multiplier when applicable
- shows assignment when schedule mode is active
- shows effective cost/workload when parallelized
- keeps detailed scientific content out of the card body

The summary line is derived from:

- objective
- else procedure summary
- else decision supported
- else results

That keeps node cards useful without becoming walls of text.

### `src/components/NodeEditor.tsx`

This is the main graph editing surface for node details.

It now supports the richer translational schema while staying reasonably compact.

Important behaviors:

- initializes state from selected node
- resets state in create mode
- trims string fields on save
- validates numeric fields
- supports owner and operator assignment
- shows parallelization multiplier only when it is structurally relevant
- keeps risk snapshot visible for active nodes
- offers deep reasoning on demand

### `src/components/EvidencePanel.tsx`

This is the current primary grounded-query UI.

It provides:

- free-text query entry
- loading state
- structured answer rendering
- structured supporting evidence cards
- missing evidence list
- clickable node references

### `src/components/ReviewPanel.tsx`

This panel renders graph-wide structured findings.

Each finding shows:

- severity
- type
- summary
- details
- suggested action
- node references

### `src/components/DeepRiskPanel.tsx`

This is the structured deep reasoning viewer.

It exposes the backend response almost one-for-one, making the reasoning inspectable and auditable instead of conversationally vague.

### `src/components/AcceleratePanel.tsx`

This panel displays one proposed acceleration move at a time.

It exposes:

- summary
- source and target titles
- duration delta
- cost delta
- resulting cost
- resulting duration
- rationale
- accept/reject controls

### `src/components/ChatPanel.tsx`

This file still exists in the repository, but it is not currently wired into `src/App.tsx`.

That means:

- the chat UI is presently dormant
- the product no longer positions Chat as a primary surface
- Evidence is the preferred grounded query experience

### `src/components/PersonnelPanel.tsx`

This file also still exists, but it is effectively superseded by `ProgramContextPanel.tsx`.

Personnel management is now consolidated into the left-side setup panel.

### `src/utils/graph.ts`

This file contains lightweight graph helpers for:

- ID creation
- edge existence checks
- effective multiplier resolution
- effective cost/workload calculations
- active versus terminal status helpers
- labels for type/status/priority
- compact node summary selection

### `src/utils/risk.ts`

This file contains the frontend severity mapping for node warnings.

A node’s warning severity is driven by the dominant level among:

- `overallRisk`
- `fragility`
- `coherenceRisk`

This is important because the canvas warning badge now indirectly reflects Phase 1 / IND coherence, not just generic risk.

### `src/styles.css`

The styling is intentionally restrained and readable.

Current design characteristics:

- IBM Plex Sans driven typography
- light neutral palette
- large gridded canvas background
- translucent overlay panels with blur
- compact operational UI
- strong preference for information density over decorative chrome

The visual direction is more “serious internal tooling” than “consumer app,” which fits the current take-home positioning.

## Backend Structure

The backend currently lives almost entirely in `backend/app.py`.

That file contains:

- Pydantic schemas
- graph normalization at the API boundary
- the deterministic schedule solver
- acceleration candidate enumeration
- graph-context builders for AI endpoints
- OpenAI-backed endpoint handlers
- FastAPI routes

This is intentionally centralized and explicit. It is not the cleanest long-term production decomposition, but it makes the demo logic inspectable in a single file.

## Backend Schemas And Validation

The backend defines strict request/response models using Pydantic.

Important models include:

- `ProgramPayload`
- `NodePayload`
- `EdgePayload`
- `PersonnelPayload`
- `GraphPayload`
- `ScheduleResponse`
- `AccelerationProposal`
- `RiskScanResponse`
- `DeepRiskResponse`
- `ReviewResponse`
- `EvidenceQueryResponse`
- `ChatResponse`

### Backend legacy normalization

The backend independently normalizes some legacy shapes before downstream logic runs.

`NodePayload` currently maps:

- `content` -> `procedureSummary`
- `completed` -> `status`

`ProgramPayload` normalizes an empty or invalid `programTitle` to `None`.

This means both frontend and backend are resilient to older graph payloads.

## Deterministic Scheduling Engine

The scheduling engine is the strongest preserved core of the original platform.

It is implemented in `solve_schedule_response(...)` inside `backend/app.py`.

### What the scheduler does

For active nodes only, it:

- validates the graph is acyclic
- computes a scale factor to preserve decimal durations/hours
- builds CP-SAT interval variables
- optionally assigns one eligible operator per node
- enforces cumulative personnel capacity constraints
- applies dependency constraints
- applies edge-level parallelization semantics
- minimizes makespan with a secondary bias toward earlier finishes

### Edge-level parallelization semantics

This remains deliberately unchanged.

For a normal dependency:

- `target.start >= source.finish`

For a parallelized dependency:

- `target.start >= source.start`

This is the current definition of “controlled overlap” in the platform.

### Personnel semantics

If a node has eligible operators present in the personnel pool:

- exactly one is assigned
- their weekly capacity is respected cumulatively

If a node has no valid eligible operators:

- the scheduler still schedules the node
- it records a diagnostic that the node has no eligible operators
- `usesPersonnel` is false in that sense

### Terminal node semantics

Nodes in terminal statuses are not part of the active solve.

For those nodes, the backend still returns a `ScheduledNode`, but with:

- `start = 0`
- `finish = 0`
- no active assignment

This preserves response shape stability for the frontend.

### Objective function

The solver minimizes:

- makespan first
- then earlier end times across the graph

That secondary weighting helps avoid arbitrary late placements when multiple solutions have the same makespan.

### Performance profile

For the current demo graphs, the deterministic solver is fast.

The recent “Assign feels slow” regression was not caused by OR-Tools itself. It was primarily caused by graph-wide AI rescans being tied too broadly to graph changes. The layout-signature fix corrected the most visible part of that issue.

## Planned Cost Calculation

Planned cost is not just a raw sum of node costs.

The current logic:

- excludes terminal nodes
- applies the effective parallelization multiplier to targets with incoming parallelized edges

This is used consistently in:

- toolbar planned cost display
- acceleration evaluation
- baseline versus proposed plan comparison

## Acceleration Workflow

Acceleration is implemented as a tightly controlled hybrid workflow.

### Current architecture

1. The backend computes the baseline deterministic schedule.
2. The backend enumerates legal candidate moves.
3. Each candidate corresponds to:
   - toggling one dependency edge to `parallelized = true`
   - optionally increasing the target node’s multiplier from 1x to 4x
4. The backend solves each candidate graph deterministically.
5. Non-improving and budget-infeasible candidates are filtered out.
6. The remaining shortlist is passed to the model.
7. The model chooses one candidate or chooses to stop.
8. The user accepts, rejects, or stops.

### Candidate metadata

Candidates include rich context such as:

- source and target titles
- source and target summaries
- source and target types
- target blocker priority
- target Phase 1 relevance
- target IND relevance
- target decision supported
- target program relevance score
- duration delta
- cost delta
- incoming dependency summaries
- remaining budget

### Candidate ordering before model selection

Candidates are pre-sorted by the backend using:

- blocker priority
- duration improvement
- program relevance score
- cost delta
- multiplier
- title

This means the model is not starting from an unordered search space.

### Current optimization objective

The acceleration prompt was upgraded so the model is explicitly asked to optimize for:

- faster path to clinic
- spend discipline
- preserved coherence
- sensible scientific and operational logic

It is explicitly told not to chase raw makespan if that weakens the clinic-bound story.

### Why this is a strong architectural choice

This design keeps the most important controls deterministic:

- what moves are legal
- what the resulting schedule is
- what the cost impact is

The model is only ranking credible moves, not inventing actions.

## Graph Context Builders For AI Features

The backend uses dedicated graph-context construction instead of sending raw frontend state blindly.

### `build_chat_graph_context(...)`

This builds a structured graph snapshot that includes:

- program context
- personnel
- node details
- schedule details if available
- parent/child relationships
- planned cost
- planned duration

This context is reused across several model-backed features, not just chat.

### `build_risk_graph_context(...)`

This extends the graph context with schedule-derived structural information such as:

- node depth
- downstream dependency count
- whether the node is on the critical-path terminal frontier
- program relevance score

That additional context supports coherence and fragility reasoning.

## AI-Backed Endpoints

The backend currently exposes several LLM-powered endpoints.

All of them:

- require `OPENAI_API_KEY`
- use strict JSON schema formatting
- validate the returned JSON with Pydantic
- filter node IDs against actual graph contents where relevant

### `/api/risk/scan`

Purpose:

- score every active node across multiple risk dimensions

Current output fields per node:

- `scientificRisk`
- `executionRisk`
- `regulatoryRisk`
- `coherenceRisk`
- `overallRisk`
- `fragility`
- `summary`
- `scientificDrivers`
- `executionDrivers`
- `regulatoryDrivers`
- `coherenceDrivers`
- `fragilityDrivers`
- `recommendations`
- `keyAssumptions`
- `affectedClaims`
- `changeSummary`

Important implementation details:

- only active nodes are scored
- prior assessments can be passed back in
- `changeSummary` is intended to explain why a node’s posture changed
- the prompt explicitly defines coherence risk and fragility as separate concepts

### `/api/risk/deep`

Purpose:

- expand a single active node into a detailed inspectable assessment

Current output includes:

- executive summary
- detailed reasoning
- scientific breakdown
- execution breakdown
- regulatory breakdown
- coherence breakdown
- fragility breakdown
- key assumptions used
- affected downstream claims
- missing evidence
- mitigation strategies
- parallelization options
- what would resolve uncertainty
- likely timeline impact
- likely spend impact
- scenarios

Important prompt behavior:

- explicitly prohibits revealing hidden chain-of-thought
- asks for explicit reasoning instead
- grounds the response in graph + schedule context

### `/api/review`

Purpose:

- inspect the graph for development-strategy inconsistencies and structural issues

Current review finding types:

- `contradiction`
- `outdated_description`
- `redundancy`
- `instrumentation_risk`
- `dependency_mismatch`
- `phase1_ind_inconsistency`
- `missing_critical_evidence`
- `blocker_priority_mismatch`
- `orphaned_experiment`
- `wasted_spend`
- `stale_results_assumption`
- `other`

Important current behavior:

- uses program context
- uses graph topology
- uses schedule context if available
- focuses on high-signal findings
- caps result volume to avoid noisy output

### `/api/evidence/query`

Purpose:

- answer graph-grounded evidence questions with structured support and gaps

Current response shape:

- `answer`
- `supportingEvidence`
- `missingEvidence`
- `referencedNodeIds`

Each supporting evidence record contains:

- `nodeId`
- `field`
- `snippet`
- `rationale`

This is one of the most differentiated features in the current product because it makes the graph act like a queryable evidence base rather than just a task board.

### `/api/accelerate/propose`

Purpose:

- return the next best legal acceleration proposal or stop

Current behavior:

- computes baseline schedule and cost
- enumerates legal candidates
- filters out weak/infeasible options
- asks the model to pick one or stop
- returns a structured proposal with expected value fields

### `/api/chat`

Purpose:

- grounded open-ended Q&A over the graph

Current state:

- the backend route still exists
- the schema and prompting still exist
- the frontend no longer surfaces Chat as an active primary workflow

This is a deliberate product simplification, not a backend removal.

### `/api/schedule`

Purpose:

- deterministic schedule solve

This endpoint is not model-backed.

### `/api/health`

Purpose:

- simple backend health check

## Risk Model Evolution

The most important product-level upgrade in this repo is the move from generic risk scoring to clinic-bound coherence-aware risk scoring.

### Risk dimensions

The platform now reasons about:

- scientific risk
- execution risk
- regulatory risk
- coherence risk
- overall risk
- fragility

### What coherence risk means in this product

Coherence risk asks:

> How likely is it that this node, its absence, its delay, or its current results undermines the coherence of the intended Phase 1 design or IND story?

That makes the product meaningfully more domain-specific than a generic R&D task planner.

### What fragility means in this product

Fragility is not the same as failure probability.

Fragility is about:

- how much the broader program suffers if a node slips or fails
- how many downstream nodes it gates
- whether it sits on a critical path
- how much rework or replanning it would trigger
- whether it can be responsibly hedged with overlap

### Frontend warning behavior

The node warning badge logic intentionally considers:

- overall risk
- fragility
- coherence risk

This means the canvas can reflect a strategically incoherent node even if the generic scientific risk alone is not the highest dimension.

## Review And Evidence Compared

The current product intentionally differentiates these two.

### Evidence

Evidence is for:

- support queries
- missing-support audits
- claim tracing
- inspectable snippets

### Review

Review is for:

- inconsistency detection
- priority mismatch detection
- stale assumption detection
- wasted spend detection
- graph-wide strategic critique

### Why chat was deprioritized

Chat was removed from the primary UI because it made the product feel more like a generic AI wrapper.

Evidence is more:

- inspectable
- grounded
- product-specific
- aligned with the IND-story positioning

## Current Demo Payload

The most representative current import is:

- `example_translational_program_graph.json`

It demonstrates:

- program title
- target Phase 1 design
- target IND strategy
- richer node schema
- evidence references
- mixed statuses
- a plausible translational program shape

The example is explicitly demo-oriented. It is not pretending to be a real regulatory package.

## Testing State

The project now has a lightweight but meaningful automated test layer.

### Frontend

Frontend tests use:

- Vitest
- Testing Library
- jsdom

Current frontend coverage includes:

- old graph normalization into the richer schema
- program context persistence to localStorage
- node editor rendering and saving of richer schema fields
- coherence-aware risk snapshot rendering

Key files:

- `src/hooks/useLocalStorageGraph.test.tsx`
- `src/components/NodeEditor.test.tsx`

### Backend

Backend tests use:

- pytest

Current backend coverage includes:

- legacy payload normalization
- preserved schedule behavior for old-style payloads
- program context inclusion in graph-context building
- schema validation for `coherenceRisk`
- structured review/evidence validation

Key file:

- `backend/tests/test_app.py`

### Current test/build commands

- `npm run test`
- `npm run test:frontend`
- `npm run test:backend`
- `npm run build`

## Current Strengths Of The Platform

The strongest things about the current implementation are:

- it preserves the deterministic scheduler rather than replacing it with vague AI planning
- it preserves edge-level parallelization rather than inventing a new scheduling model
- it cleanly separates editable graph state from derived analyses
- it uses structured outputs and schema validation for AI features
- it grounds model reasoning in graph + program context
- it now has a more differentiated product story around Phase 1 / IND coherence
- it remains human-in-the-loop for optimization

## Current Limitations And Known Gaps

The current repo is strong for a take-home/demo, but it is not pretending to be complete production software.

### 1. No dedicated timeline or Gantt view

The schedule exists and is visible through node assignments and derived duration, but there is no separate read-only timeline panel yet.

### 2. Backend concentration

`backend/app.py` contains a lot of responsibility.

That is acceptable for a demo and keeps behavior inspectable, but it is not ideal as a long-term production decomposition.

### 3. Legacy naming remains in a few places

Examples:

- package name still references `minimal-flowchart-editor`
- localStorage key is still `minimal-flowchart-editor-state`

These do not break functionality, but they are visible remnants of the project’s earlier identity.

### 4. Dormant files still exist

The repo still contains:

- `src/components/ChatPanel.tsx`
- `src/components/PersonnelPanel.tsx`

These are no longer part of the main surfaced workflow.

### 5. Local-first persistence only

There is currently:

- no database
- no backend persistence layer
- no multi-user collaboration
- no auth

This is a single-user local workspace with AI-backed analysis.

### 6. Model latency is still real

The deterministic schedule is fast, but model-backed features naturally take longer.

The code mitigates this with:

- tight prompts
- strict schemas
- structured outputs

But it still depends on remote model round-trips.

## Current Runbook

### Install dependencies

```bash
npm install
python3 -m venv .venv
.venv/bin/pip install -r backend/requirements.txt
```

### Set OpenAI key for model-backed features

```bash
export OPENAI_API_KEY=your_key_here
```

### Run backend

```bash
npm run dev:server
```

### Run frontend

```bash
npm run dev
```

### Build

```bash
npm run build
```

### Test

```bash
npm run test
```

## Environment Variables Used By The Backend

At minimum:

- `OPENAI_API_KEY`

Optional model overrides:

- `OPENAI_ACCELERATE_MODEL`
- `OPENAI_RISK_MODEL`
- `OPENAI_RISK_DEEP_MODEL`
- `OPENAI_CHAT_MODEL`
- `OPENAI_REVIEW_MODEL`
- `OPENAI_EVIDENCE_MODEL`

## Current Overall Assessment

In its current state, this repository is building a credible translational program planning and analysis platform rather than a generic AI demo.

The project now combines:

- a human-authored graph
- deterministic scheduling
- controlled budget-aware acceleration
- graph-grounded evidence retrieval
- graph-wide review
- coherence-aware risk scoring
- deep inspectable node reasoning
- backward-compatible persistence
- lightweight automated tests

The most important thing about the current implementation is that it remains disciplined.

It does not present itself as a magical autonomous scientist. Instead, it acts like a cockpit:

- the user defines the program
- the system computes the schedule
- the system highlights fragility and incoherence
- the system retrieves evidence and gaps
- the system proposes bounded acceleration moves
- the human decides what to do next

That is the defining characteristic of the platform as it exists in this repository now.
