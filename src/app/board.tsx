"use client";

import {
  Background,
  ReactFlow,
  ReactFlowProvider,
} from "@xyflow/react";
import { useShallow } from "zustand/react/shallow";
import { nodeTypes } from "@/components/nodes";
import { useCanvasInputs } from "@/hooks/use-canvas-inputs";
import { useBoardStore } from "@/lib/store";

const proOptions = { hideAttribution: true };

function BoardCanvas() {
  const { nodes, onNodesChange } = useBoardStore(
    useShallow((s) => ({
      nodes: s.nodes,
      onNodesChange: s.onNodesChange,
    })),
  );
  const { onDragOver, onDrop } = useCanvasInputs();

  return (
    <div
      style={{ width: "100vw", height: "100vh" }}
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      <ReactFlow
        nodes={nodes}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        fitView
        proOptions={proOptions}
      >
        <Background gap={20} size={1} />
      </ReactFlow>
    </div>
  );
}

export function Board() {
  return (
    <ReactFlowProvider>
      <BoardCanvas />
    </ReactFlowProvider>
  );
}
