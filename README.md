# Minimal Flowchart Editor

A minimal, monochrome flowchart editor built with React, TypeScript, and Vite. The app focuses on a restrained enterprise-style UI: compact nodes, subtle grid canvas, hidden-on-idle editor panel, and explicit directed connection flow.

## Setup

```bash
npm install
```

## Run

```bash
npm run dev
```

To create a production build:

```bash
npm run build
```

## Architecture Overview

- `src/App.tsx`: top-level state orchestration for nodes, edges, selection, connection mode, dragging, and editor visibility
- `src/components/Canvas.tsx`: scrollable canvas shell, empty state, node and edge composition
- `src/components/FlowNode.tsx`: compact draggable node card
- `src/components/EdgeLayer.tsx`: SVG-based directed edges with arrow markers
- `src/components/NodeEditor.tsx`: shared create/edit side panel with save, delete, and connect actions
- `src/hooks/useLocalStorageGraph.ts`: local graph persistence in `localStorage`
- `src/types/graph.ts`: explicit TypeScript types for nodes, edges, and editor mode

## Interaction Notes

- Click `Add Node` to open the editor and create a new node
- Click any existing node to edit its title and content
- Drag nodes directly on the canvas to reposition them
- Click `Connect` in the editor to enter connection mode, then click another node to create a directed edge
- Press `Escape` to close the editor or cancel connection mode
- Clicking empty canvas clears selection and hides the editor

## Notes

- Node and edge state persist in `localStorage`
- Duplicate edges are prevented
- Self-connections are intentionally blocked
