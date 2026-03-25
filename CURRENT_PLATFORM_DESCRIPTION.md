# Current Platform Description

## Overview

This repository contains an interactive graph-based planning and analysis platform for preclinical and clinical R&D programs. At its core, the product models a development program as a directed graph of experiments or work packages. Each node represents a study, assay, or milestone-like work item. Each edge represents a dependency. On top of that graph representation, the system currently provides:

- graph authoring and editing
- import/export of realistic graph payloads
- deterministic scheduling with personnel allocation
- selective dependency-level parallelization
- budget-constrained acceleration proposals
- graph-grounded chat assistance
- graph-wide review for contradictions and redundancies
- graph-wide risk and fragility scoring for uncompleted experiments
- node-level deep reasoning for detailed risk/fragility analysis

The application is no longer just a diagram editor. It is now a combined planning, scheduling, acceleration, review, and risk-analysis environment for drug-development style programs.

## Product Goal

The practical product goal is to help a user answer questions such as:

- What is the current planned duration and cost of this program?
- Which experiments are bottlenecks?
- Which dependencies are safe candidates for partial parallelization?
- Where are we vulnerable to delay, rework, or poor first-pass success?
- Which experiments are risky but acceptable, and which are fragile enough to threaten the whole program?
- What should we spend money or effort on to reach IND faster with less program-level fragility?

The design philosophy is decision support rather than automatic decision making. The system computes and proposes, but the human remains in control of actual graph edits.

## High-Level Architecture

The platform has two major layers:

### 1. Frontend

- Stack: Vite + React + TypeScript
- Primary orchestration file: `src/App.tsx`
- Persistence: browser `localStorage`
- Primary UI responsibilities:
  - graph editing
  - side-panel orchestration
  - backend request/response handling
  - derived schedule display
  - derived AI analysis display
  - accept/reject loops for acceleration
  - automatic risk rescoring when graph content changes

### 2. Backend

- Stack: Python + FastAPI
- Main service file: `backend/app.py`
- Main backend responsibilities:
  - input validation
  - acyclicity validation
  - deterministic scheduling using OR-Tools CP-SAT
  - candidate enumeration for acceleration
  - OpenAI-backed structured analysis for acceleration, chat, review, risk scan, and deep risk reasoning

This architecture deliberately separates deterministic computation from model judgment. Where the platform can calculate something exactly, it does so in code. Where qualitative scientific judgment is needed, it uses the OpenAI API with structured outputs.

## Current Core Capabilities

## 1. Graph Authoring

Users can create, edit, connect, delete, import, and export nodes in a visual workspace.

Each node currently stores:

- `id`
- `title`
- `content` (used as Description)
- `results`
- `cost`
- `duration` in weeks
- `workHoursPerWeek`
- `parallelizationMultiplier`
- `operators` (eligible personnel names)
- `completed`
- `x`, `y` for layout

Each edge currently stores:

- `id`
- `source`
- `target`
- `parallelized`

Personnel records store:

- `name`
- `hoursPerWeek`

The graph is persisted locally in browser storage and normalized on load/import so older or partial payloads do not break the app.

## 2. Deterministic Scheduling

The scheduler is one of the central pieces of the system.

### Scheduling Semantics

- Time is modeled in weeks.
- Completed nodes are excluded from active scheduling.
- Non-parallelized edges impose finish-to-start behavior:
  - the target can start only after the source finishes
- Parallelized edges impose start-to-start behavior:
  - the target can start after the source starts
- Nodes with eligible operators must be assigned exactly one operator.
- Nodes without eligible operators are still scheduled, but are marked as requiring no internal operator.
- Operators are not exclusive single-task resources.
- Instead, operator load is enforced through weekly cumulative capacity.
- A person can support multiple concurrent nodes if the sum of weekly hours does not exceed their capacity.

### Scheduling Engine

The backend uses OR-Tools CP-SAT. The scheduling formulation currently includes:

- start and end variables per active node
- optional assignment intervals per `(node, operator)` eligibility pair
- exactly-one assignment constraints where personnel are eligible
- cumulative constraints per operator for weekly workload capacity
- dependency constraints derived from edge semantics
- makespan minimization with a tie-break toward earlier end times overall

This is an exact optimization-based scheduler rather than a heuristic matching system.

## 3. Parallelization Model

Parallelization in this platform is intentionally modeled on edges, not directly on nodes.

### Why Edge-Level Parallelization

This allows the user to express:

- parallelize a successor relative to one predecessor
- keep the same successor sequential relative to another predecessor

That is more precise than a simple node-level “parallelize this experiment” toggle.

### Parallelization Multiplier

Nodes also carry a `parallelizationMultiplier` with values `1..4`. However, that multiplier only has effect if the node has at least one incoming parallelized edge.

When active, the multiplier:

- multiplies node cost
- multiplies weekly staffing demand
- does **not** change duration directly

This models the idea of running more variants or arms in parallel to reduce scientific uncertainty, while consuming more resources.

## 4. Accelerate Feature

The `Accelerate` feature proposes graph edits that may shorten the program under a budget.

### Current Design

This is a hybrid deterministic + LLM system.

The flow is:

1. Compute baseline schedule and cost.
2. Enumerate all legal candidate edits:
   - choose a currently non-parallelized edge
   - choose a legal multiplier for the target node
3. Simulate each candidate with the deterministic scheduler.
4. Filter candidates to those that:
   - improve deterministic makespan
   - stay within budget if budget is set
   - are not already rejected by the user
5. Send the shortlist to OpenAI.
6. Have the model choose:
   - one candidate to propose
   - or stop if nothing is worthwhile
7. Compute a simple risk-adjusted expected-duration rule in backend code.
8. Reject the proposal if it is not worthwhile after risk adjustment.
9. Return a single proposal to the frontend.

### Why This Matters Architecturally

The model is not allowed to invent arbitrary graph edits. It only selects from backend-enumerated candidates. That makes the feature materially safer and more consistent than a fully free-form “agent edits your plan” system.

### User Flow

The frontend runs an accept/reject/stop loop:

- `Accept`
  - applies the proposed edge parallelization and multiplier
  - immediately requests the next proposal on the updated graph
- `Reject`
  - blacklists that candidate id
  - requests another proposal
- `Stop`
  - exits the acceleration loop

This creates a controlled human-in-the-loop optimization workflow.

## 5. Graph-Grounded Chat

The `ChatGPT` feature answers questions about the current graph.

### Behavior

- The graph snapshot is the source of truth for program-specific facts.
- The model may use general scientific or drug-development knowledge for interpretation and suggestions.
- Responses may include referenced node ids structurally.
- The UI renders those references as clickable node chips instead of embedding raw ids in prose.

### Practical Effect

This lets a user ask for interpretation or advice while preserving a clean separation between:

- graph-grounded facts
- general domain reasoning

## 6. Review Feature

The `Review` feature is a dedicated structured analysis pass over the graph.

### Current Output Types

It can return findings such as:

- contradiction
- outdated description
- redundancy
- instrumentation risk
- dependency mismatch
- other

### Important Behavior

- It reads both `Description` and `Results`.
- It does not limit itself to completed nodes.
- It is intended to catch stale plans, inconsistent assumptions, and downstream mismatches.

This is not a conversational feature. It is a dedicated advisory pass with structured findings.

## 7. Risk and Fragility Scoring

This is the newest major agentic capability added to the platform.

### Product Intent

The platform now automatically estimates risk and fragility for all uncompleted nodes whenever the graph’s substantive contents change.

The purpose is to help users identify:

- experiments likely to fail or need redo
- experiments likely to create cost and delay
- experiments whose failure would propagate through the program
- experiments that are risky but not program-threatening
- experiments that are only moderately risky but extremely fragile from a timeline perspective

### Key Distinction

- Risk = likelihood of failure, repetition, redesign, delay, or unusable results
- Fragility = impact on the overall program if the node slips or fails

This distinction is central to the platform’s current analytical model.

### Dimensions Scored

For every uncompleted node, the backend requests structured assessment of:

- scientific risk
- execution risk
- regulatory risk
- overall first-pass success likelihood
- fragility

All use exactly five buckets:

- Very Low
- Low
- Medium
- High
- Very High

### Automatic Rescoring Trigger

Risk rescoring is wired to a frontend signature derived from graph substance rather than layout.

This means rescoring occurs when the graph changes in ways that can affect planning or scientific interpretation, for example:

- node title
- description
- results
- cost
- duration
- weekly hours
- parallelization state
- multiplier state
- operators
- completion state
- personnel definitions
- budget state if included in the same graph context

It does **not** rescore when a node is merely dragged to a new position, because layout coordinates are intentionally excluded from the rescore signature.

### Current Risk Scan UI Behavior

- All uncompleted nodes receive background scoring.
- Nodes assessed as high/very-high in overall risk or fragility are flagged visually on the canvas.
- The current implementation uses a small warning badge in the node header:
  - yellow-like warning for `High`
  - red-like critical marker for `Very High`
- The selected node’s editor shows a compact risk snapshot:
  - overall risk
  - fragility
  - scientific risk
  - execution risk
  - regulatory risk
  - summary
  - change summary if prior assessment context exists

### Current Deep Reasoning Capability

When a user selects an uncompleted node in the editor, they can click `Deep Reasoning`.

This triggers a second, more detailed backend analysis for that specific node and opens a dedicated panel showing:

- overall risk
- fragility
- scientific/execution/regulatory levels
- executive summary
- detailed reasoning
- scientific breakdown
- execution breakdown
- regulatory breakdown
- fragility breakdown
- mitigation strategies
- parallelization options
- scenario views

Important implementation detail:

The backend prompt instructs the model not to reveal hidden chain-of-thought, but instead to provide explicit structured reasoning and explanation. So the panel is “full reasoning” in the product sense of an explicit explanation, not raw internal model chain-of-thought.

## Backend API Surface

The backend currently exposes:

- `GET /api/health`
- `POST /api/schedule`
- `POST /api/accelerate/propose`
- `POST /api/chat`
- `POST /api/review`
- `POST /api/risk/scan`
- `POST /api/risk/deep`

### Endpoint Roles

#### `/api/schedule`

Runs the deterministic scheduler and returns:

- makespan
- node-level start/finish
- operator assignments
- diagnostics

#### `/api/accelerate/propose`

Runs the accelerate pipeline and returns:

- baseline cost
- baseline duration
- shortlisted candidate count
- either:
  - one proposal
  - or a stop reason

#### `/api/chat`

Runs graph-grounded conversational analysis and returns:

- one assistant message
- structured node references

#### `/api/review`

Runs structured graph review and returns:

- a list of findings

#### `/api/risk/scan`

Runs graph-wide risk/fragility scoring and returns:

- one structured assessment per uncompleted node

#### `/api/risk/deep`

Runs focused node-level deep analysis and returns:

- one detailed node analysis for the requested uncompleted node

## OpenAI Integration

The backend uses the OpenAI Responses API for all model-backed features.

### Current Model Defaults

The system is currently set up to use the pinned default model:

- `gpt-5.4-2026-03-05`

Feature-specific environment overrides exist in the backend for:

- accelerate
- chat
- review
- risk scan
- deep risk

### Structured Output Design

Each AI feature uses JSON-schema-like structured outputs and validates them into Pydantic models. This is important for reliability.

Instead of relying on brittle string parsing, the platform asks the model for constrained machine-readable data structures and validates them in backend code before the frontend receives them.

This pattern is used across:

- accelerate proposal choice
- chat answer + referenced nodes
- review findings
- risk scan node assessments
- deep risk analysis payload

## Frontend UX Model

## Main Workspace

The workspace is a large pannable, zoomable canvas.

Current interaction behaviors include:

- drag nodes
- click nodes to open editor
- pan the background
- trackpad pinch/ctrl-wheel zoom scoped to the canvas
- auto-layout imported graphs
- highlight referenced nodes from chat/review

### Important Interaction Constraint

Clicking selects and opens a node. Dragging repositions it. The system explicitly suppresses accidental click-open behavior after a drag.

## Node Editor

The node editor currently supports:

- title
- description
- results
- cost
- duration
- workload
- eligible operators
- completion state
- parallelization multiplier when applicable
- connect mode
- parallelize mode
- delete
- risk summary for uncompleted nodes
- deep reasoning trigger

This means the node editor is now both an authoring surface and a local analytical surface.

## Floating Side Panels

The app currently includes multiple floating panels:

- `AcceleratePanel`
- `ChatPanel`
- `ReviewPanel`
- `DeepRiskPanel`
- node editor

Each has its own open/close and loading behavior controlled centrally from `App.tsx`.

## Data Flow and State Management

The system uses a relatively centralized frontend architecture.

### `src/App.tsx`

`App.tsx` is currently the orchestration layer for:

- core graph state
- selected node state
- interaction mode state
- derived schedule state
- accelerate state
- chat state
- review state
- risk scan state
- deep risk state
- viewport and zoom state

This makes the file an application controller rather than a simple composition shell.

### Persistence

Graph state is persisted through the `useLocalStorageGraph` hook.

That hook currently handles:

- initial default graph state
- localStorage read/write
- normalization of loaded graph data
- compatibility defaults for missing fields

### Derived State

Several important parts of the application are derived, not stored as canonical graph state:

- schedule
- operator assignment display
- accelerate proposal
- review findings
- risk assessments
- deep risk reasoning

This is a strong architectural choice. It keeps the editable graph definition separate from computed analysis.

## Current Implementation of Risk and Fragility

Because this is a newly added capability, it is worth describing its implementation more concretely.

### Graph-Wide Risk Scan

The backend:

1. receives the graph and previous assessments
2. computes a derived schedule using the same scheduler used elsewhere
3. builds a graph context that includes:
   - nodes
   - edges
   - personnel
   - schedule
   - planned cost
   - planned duration
4. enriches that context with fragility-relevant signals such as:
   - node depth
   - downstream dependency count
   - simple critical-path terminal information
5. asks the model for structured per-node assessments
6. validates the response
7. filters it to uncompleted nodes actually present in the graph

### Deep Node Analysis

The backend:

1. validates the requested node exists
2. rejects completed nodes for deep reasoning
3. builds the same schedule-aware graph context
4. passes the focus node id and prior assessment into the model request
5. requests a structured explanation payload with:
   - levels
   - summaries
   - detailed explanation
   - mitigations
   - parallelization options
   - scenarios
6. validates the response and confirms the returned node id matches the requested node

### Warning Badge Logic

The frontend computes warning severity from the maximum of:

- overall risk
- fragility

Current mapping:

- `High` => warning badge
- `Very High` => critical badge
- lower levels => no badge

This keeps the visual language restrained rather than noisy.

## Example User Journey

A typical workflow now looks like this:

1. User creates or imports a program graph.
2. User edits descriptions, results, durations, costs, and personnel.
3. The platform automatically rescans risk and fragility for all uncompleted nodes.
4. Warning badges appear on risky or fragile nodes.
5. User clicks `Assign` to see the deterministic schedule and operator allocations.
6. User runs `Review` to identify contradictions or stale assumptions.
7. User opens a risky node and clicks `Deep Reasoning`.
8. The platform presents detailed explanation, mitigations, and potential parallelization options for that node.
9. User optionally runs `Accelerate` to receive one controlled parallelization proposal at a time.
10. User accepts or rejects proposed acceleration edits based on tradeoffs.

This is the intended combined planning + analysis workflow.

## Current Strengths

The platform’s strongest current qualities are:

- exact deterministic scheduling rather than ad hoc sequencing
- clean edge-level parallelization semantics
- careful separation between editable graph state and derived analysis
- structured model outputs instead of fragile free-form responses
- graph-grounded prompts that reduce unsupported claims
- a practical human-in-the-loop approach for acceleration
- automatic risk monitoring without making the graph visually cluttered
- targeted deep reasoning for node-level investigation

## Current Limitations

The platform is already substantial, but there are still important limitations.

### 1. No Automated Test Suite

There are currently no robust automated tests covering:

- scheduling correctness
- candidate enumeration correctness
- OpenAI response schema robustness
- risk scan behavior
- deep reasoning behavior
- major UI interactions

### 2. LLM Outputs Remain Heuristic

The following features rely on model judgment:

- accelerate candidate selection
- review findings
- risk/fragility scoring
- deep risk reasoning
- chat interpretation

These features are structured and constrained, but they are still heuristic rather than empirically calibrated.

### 3. Risk Is Not Empirically Calibrated

The risk system currently uses categorical levels only and intentionally avoids false precision. That is a good product choice, but it also means:

- there is no trained success-probability model
- there is no benchmarked calibration across study types
- consistency depends heavily on prompt quality and model behavior

### 4. Fragility Model Is Still Simplified

Fragility currently benefits from derived schedule context and graph topology, but it is not a mathematically rigorous program fragility model. It does not yet include:

- richer critical-path sensitivity analysis
- alternative path redundancy models
- Monte Carlo delay propagation
- explicit contingency modeling

### 5. Deep Reasoning Is Advisory Only

The deep reasoning panel currently explains and recommends. It does not:

- directly modify the graph
- create mitigation tasks automatically
- create alternative candidate schedules automatically

### 6. No Gantt or Timeline Visualization

Users can inspect schedule data, but there is not yet a dedicated Gantt-style timeline view.

### 7. README Is Behind the Real Product

The codebase and handoff describe a more advanced platform than the default README currently does.

## Current Operational State

At the moment reflected by this repository state:

- the frontend builds successfully
- the backend health endpoint responds correctly
- dev frontend and backend can run locally
- OpenAI-backed features require a valid `OPENAI_API_KEY`
- the risk and deep reasoning features are implemented in code and wired into the UI

## Current File-Level Responsibility Map

The current implementation is primarily organized as follows:

- `backend/app.py`
  - FastAPI service
  - data models
  - scheduler
  - accelerate candidate logic
  - chat/review/risk/deep-reasoning LLM integrations

- `src/App.tsx`
  - application orchestration
  - request flows
  - state coordination
  - feature panel wiring
  - automatic risk rescoring logic

- `src/hooks/useLocalStorageGraph.ts`
  - persisted graph state
  - normalization
  - import compatibility

- `src/components/Canvas.tsx`
  - main visual graph stage

- `src/components/FlowNode.tsx`
  - node card rendering
  - warning badge rendering
  - schedule snapshot display

- `src/components/NodeEditor.tsx`
  - node editing
  - local risk snapshot display
  - deep reasoning trigger

- `src/components/AcceleratePanel.tsx`
  - accelerate proposal presentation

- `src/components/ChatPanel.tsx`
  - graph-grounded chat UI

- `src/components/ReviewPanel.tsx`
  - graph review UI

- `src/components/DeepRiskPanel.tsx`
  - detailed node-level risk reasoning UI

- `src/types/graph.ts`
  - shared frontend types

- `src/utils/graph.ts`
  - effective multiplier and graph helpers

- `src/utils/risk.ts`
  - frontend risk severity mapping for warnings

- `src/styles.css`
  - primary visual system and panel styling

## Strategic Interpretation of the Current Platform

The platform is best understood as a layered decision-support system:

### Layer 1: Graph Definition

The user defines the program.

### Layer 2: Deterministic Planning

The scheduler computes feasible timing and assignment structure.

### Layer 3: Controlled Optimization

The accelerate feature searches legal graph modifications under explicit backend control.

### Layer 4: Analytical Interpretation

Chat, review, risk scan, and deep reasoning help the user interpret the meaning of the plan.

This layered design is one of the strongest aspects of the current codebase. It avoids collapsing everything into a single overpowered, unreliable “agent.” Instead, it uses the model where human-style judgment is useful and uses deterministic code where exactness matters.

## Current State Summary

The platform is currently a serious prototype or early product-grade planning tool for R&D program design. It supports graph construction, exact scheduling, dependency-level acceleration proposals, contradiction review, graph-grounded chat, and newly added continuous risk and fragility estimation with per-node deep analysis.

It is already capable of supporting realistic planning conversations about bottlenecks, dependencies, scientific uncertainty, operational fragility, and selective acceleration. The main areas for future hardening are test coverage, calibration, richer quantitative fragility modeling, and more advanced visualization of schedule/risk interactions.
