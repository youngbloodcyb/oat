"use client";

import {
  Background,
  type NodeChange,
  ReactFlow,
  ReactFlowProvider,
} from "@xyflow/react";
import { useCallback } from "react";
import { useShallow } from "zustand/react/shallow";
import { nodeTypes } from "@/components/nodes";
import { Loading } from "@/components/loading";
import { useBoardActions } from "@/hooks/use-board-actions";
import { useBoardSync, useDefaultBoard } from "@/hooks/use-board-sync";
import { useCanvasInputs } from "@/hooks/use-canvas-inputs";
import { type BoardNode, useBoardStore } from "@/lib/store";
import type { Id } from "../../convex/_generated/dataModel";

const proOptions = { hideAttribution: true };

function BoardCanvas({ boardId }: { boardId: Id<"boards"> }) {
  useBoardSync(boardId);
  const { moveNode, removeNode } = useBoardActions(boardId);
  const { nodes, onNodesChange: applyChanges } = useBoardStore(
    useShallow((s) => ({ nodes: s.nodes, onNodesChange: s.onNodesChange })),
  );
  const { onDragOver, onDrop } = useCanvasInputs(boardId);

  // Apply changes locally for smooth interaction, and persist removals.
  const onNodesChange = useCallback(
    (changes: NodeChange<BoardNode>[]) => {
      applyChanges(changes);
      for (const c of changes) if (c.type === "remove") removeNode(c.id);
    },
    [applyChanges, removeNode],
  );

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
        onNodeDragStop={(_, __, dragged) =>
          dragged.forEach((n) => moveNode(n.id, n.position))
        }
        fitView
        proOptions={proOptions}
      >
        <Background gap={20} size={1} />
      </ReactFlow>
    </div>
  );
}

export function Board() {
  const boardId = useDefaultBoard();
  if (!boardId) return <Loading />;
  return (
    <ReactFlowProvider>
      <BoardCanvas boardId={boardId} />
    </ReactFlowProvider>
  );
}
