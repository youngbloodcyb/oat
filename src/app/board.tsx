"use client";

import { ReactFlow } from "@xyflow/react";
import { useShallow } from "zustand/react/shallow";
import { nodeTypes } from "@/components/nodes";
import { useBoardStore } from "@/lib/store";

export function Board() {
  const { nodes, edges, onNodesChange, onEdgesChange, onConnect } =
    useBoardStore(
      useShallow((s) => ({
        nodes: s.nodes,
        edges: s.edges,
        onNodesChange: s.onNodesChange,
        onEdgesChange: s.onEdgesChange,
        onConnect: s.onConnect,
      })),
    );

  return (
    <div style={{ width: "100vw", height: "100vh" }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        fitView
      />
    </div>
  );
}
