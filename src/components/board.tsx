"use client";

import {
  Background,
  type NodeChange,
  ReactFlow,
  ReactFlowProvider,
} from "@xyflow/react";
import { useQuery } from "convex/react";
import Link from "next/link";
import { useCallback } from "react";
import { useShallow } from "zustand/react/shallow";
import { Loading } from "@/components/loading";
import { nodeTypes } from "@/components/nodes";
import { Button } from "@/components/ui/button";
import { useBoardActions } from "@/hooks/use-board-actions";
import { useBoardSync } from "@/hooks/use-board-sync";
import { useCanvasInputs } from "@/hooks/use-canvas-inputs";
import { type BoardNode, useBoardStore } from "@/lib/store";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";

const proOptions = { hideAttribution: true };

function BoardCanvas({ boardId }: { boardId: Id<"boards"> }) {
  const ready = useBoardSync(boardId);
  const { moveNode, removeNode, resizeNode } = useBoardActions(boardId);
  const { nodes, onNodesChange: applyChanges } = useBoardStore(
    useShallow((s) => ({ nodes: s.nodes, onNodesChange: s.onNodesChange })),
  );
  const { onDragOver, onDrop } = useCanvasInputs(boardId);

  // Apply changes locally for smooth interaction, then persist the ones that
  // represent a committed edit: removals and finished resizes.
  const onNodesChange = useCallback(
    (changes: NodeChange<BoardNode>[]) => {
      applyChanges(changes);
      for (const c of changes) {
        if (c.type === "remove") {
          removeNode(c.id);
        } else if (c.type === "dimensions" && c.resizing === false) {
          // Resize finished — read the settled node and persist its size
          // (and position, since corner handles can shift it).
          const node = useBoardStore.getState().nodes.find((n) => n.id === c.id);
          const width = c.dimensions?.width ?? node?.width ?? node?.measured?.width;
          const height =
            c.dimensions?.height ?? node?.height ?? node?.measured?.height;
          if (node && width && height) {
            resizeNode(c.id, { width, height }, node.position);
          }
        }
      }
    },
    [applyChanges, removeNode, resizeNode],
  );

  // Hold the canvas until the store holds this board's nodes, so we never
  // paint the previously-open board while the new one is loading.
  if (!ready) return <Loading />;

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

function BoardNotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4">
      <p className="text-muted-foreground">This board doesn&rsquo;t exist.</p>
      <Button asChild variant="outline">
        <Link href="/">Back to boards</Link>
      </Button>
    </div>
  );
}

export function Board({ boardId }: { boardId: Id<"boards"> }) {
  // Verifies access too: boards.get returns null for missing/unowned boards.
  const board = useQuery(api.boards.get, { boardId });
  if (board === undefined) return <Loading />;
  if (board === null) return <BoardNotFound />;
  return (
    <ReactFlowProvider>
      <Button asChild variant="outline" size="sm" className="fixed top-4 left-4 z-50">
        <Link href="/">← Boards</Link>
      </Button>
      <BoardCanvas boardId={boardId} />
    </ReactFlowProvider>
  );
}
