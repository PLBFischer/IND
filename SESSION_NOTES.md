# Session Notes

## Repository

- Local path: `/Users/paolofischer/Desktop/work/test`
- GitHub remote: `https://github.com/PLBFischer/IND`
- Primary branch: `main`

## Current State

This repository contains a minimal, professional flowchart web app built with:

- React
- TypeScript
- Vite

The UI is intentionally monochrome and enterprise-style, inspired by the feel of Palantir Foundry Pipeline Builder.

## Implemented Features

### Core flow editor

- Add nodes from the top toolbar
- Click nodes to open the editor drawer
- Drag nodes freely on the canvas
- Create directed edges using explicit connect mode
- Delete nodes
- Clear selection by clicking empty canvas
- Escape closes the editor or cancels connect mode
- Graph state persists in `localStorage`

### Node fields

Each node currently stores:

- `id`
- `title`
- `content`
- `cost`
- `duration`
- `completed`
- `x`
- `y`

### Node UI behavior

- When a node is not completed, its card shows:
  - title
  - content
  - cost
  - duration
- When a node is completed, its card shows:
  - title
  - content
  - `Completed`
- The `Completed` checkbox is only shown in the editor when editing an existing node
- The checkbox is not shown during new-node creation

## Aggregate Metrics

The top toolbar shows:

- `Total Cost`
- `Total Duration`

### Total Cost

- Sum of `cost` across all nodes that are **not** completed
- Completed nodes contribute `0`

### Total Duration

- Longest path duration across the directed graph
- Path duration is the sum of node durations along that path
- Completed nodes contribute `0`
- If the graph contains a cycle, total duration displays `NaN`

## Important Files

- `src/App.tsx`: top-level state and interactions
- `src/components/Toolbar.tsx`: title bar, metrics, add-node action
- `src/components/Canvas.tsx`: canvas container and empty state
- `src/components/FlowNode.tsx`: node rendering
- `src/components/EdgeLayer.tsx`: SVG edge drawing
- `src/components/NodeEditor.tsx`: create/edit drawer
- `src/hooks/useLocalStorageGraph.ts`: persisted local graph state
- `src/utils/metrics.ts`: total cost and longest-path duration logic
- `src/types/graph.ts`: node and edge types
- `src/styles.css`: all styling

## Verification Status

Verified in this session:

- `npm install`
- `npm run build`
- `npm run dev -- --host 127.0.0.1`

At the time of the last check, the dev server was available at:

- `http://127.0.0.1:5173/`

## Recent Git History

- `22e81d8` Initial commit
- `6c26a82` Add node metrics and completion state

## Likely Next Steps

Possible follow-up work if this conversation resumes:

- Add tests for graph metric calculation, especially cycle detection and longest-path behavior
- Improve numeric formatting for cost and duration if stricter display rules are needed
- Add edge deletion or edge editing
- Add better drag bounds and canvas panning/zoom if desired
- Update README if the new node fields and aggregate metrics should be documented explicitly

## Notes For Continuation

- The user liked the current UI and asked for iterative refinement rather than redesign
- Keep the visual style restrained, sharp, and professional
- Avoid playful visuals or colorful accents
- Preserve the current interaction model unless the user asks to change it
