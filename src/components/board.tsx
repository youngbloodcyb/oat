"use client";

import {
  Background,
  type NodeChange,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
} from "@xyflow/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useShallow } from "zustand/react/shallow";
import { BoardCommandMenu } from "@/components/board-command-menu";
import { BoardPermissionsProvider } from "@/components/board-permissions";
import { DockMenu } from "@/components/dock-menu";
import { ImageCropDialog } from "@/components/image-crop-dialog";
import { Loading } from "@/components/loading";
import { NodeDock } from "@/components/node-dock";
import { nodeTypes } from "@/components/nodes";
import {
  RealtimeCursors,
  RealtimePresence,
} from "@/components/realtime-collaboration";
import { SharingDialog } from "@/components/sharing-dialog";
import { TextEditorDrawer } from "@/components/text-editor-drawer";
import { Button } from "@/components/ui/button";
import { useBoardActions } from "@/hooks/use-board-actions";
import { useBoardRealtime } from "@/hooks/use-board-realtime";
import { useBoardSync } from "@/hooks/use-board-sync";
import { useCanvasInputs } from "@/hooks/use-canvas-inputs";
import { type CanvasNode, useBoardStore } from "@/lib/store";
import type { BoardDetail } from "@/services/boards";
import type { NodeSearchResult } from "@/services/search";

const proOptions = { hideAttribution: true };

function BoardCanvas({
  board,
  focusNodeId,
  canEdit,
}: {
  board: BoardDetail;
  focusNodeId?: string;
  canEdit: boolean;
}) {
  const boardId = board.id;
  const router = useRouter();
  const { fitView, screenToFlowPosition } = useReactFlow<CanvasNode>();
  const [commandOpen, setCommandOpen] = useState(false);
  const ready = useBoardSync(boardId);
  const { moveNode, removeNode, resizeNode } = useBoardActions(boardId);
  const {
    nodes,
    pendingNodes,
    onNodesChange: applyChanges,
  } = useBoardStore(
    useShallow((s) => ({
      nodes: s.nodes,
      pendingNodes: s.pendingNodes,
      onNodesChange: s.onNodesChange,
    })),
  );
  const { onDragOver, onDrop } = useCanvasInputs(boardId, canEdit);
  // Unshared boards have nobody to sync with, so they never open a socket.
  const realtime = useBoardRealtime({
    boardId,
    enabled: ready && board.isShared,
    canEdit,
  });
  const canvasNodes = useMemo(
    () => [...nodes, ...pendingNodes],
    [nodes, pendingNodes],
  );

  const focusNode = useCallback(
    (nodeId: string) => {
      if (!useBoardStore.getState().selectNode(nodeId)) return;
      window.requestAnimationFrame(() => {
        void fitView({
          nodes: [{ id: nodeId }],
          padding: 0.5,
          maxZoom: 1.25,
          duration: 350,
        });
      });
    },
    [fitView],
  );

  useEffect(() => {
    if (ready && focusNodeId) focusNode(focusNodeId);
  }, [focusNode, focusNodeId, ready]);

  const onSelectSearchResult = useCallback(
    (result: NodeSearchResult) => {
      if (result.boardId === boardId) {
        focusNode(result.nodeId);
        return;
      }

      router.push(
        `/${encodeURIComponent(result.boardId)}?node=${encodeURIComponent(result.nodeId)}`,
      );
    },
    [boardId, focusNode, router],
  );

  // Apply changes locally for smooth interaction, then persist the ones that
  // represent a committed edit: removals and finished resizes.
  const onNodesChange = useCallback(
    (changes: NodeChange<CanvasNode>[]) => {
      const pendingIds = new Set(
        useBoardStore.getState().pendingNodes.map((node) => node.id),
      );
      for (const change of changes) {
        if (change.type === "remove" && pendingIds.has(change.id)) {
          useBoardStore.getState().removePendingNode(change.id);
        }
      }
      applyChanges(changes);
      for (const c of changes) {
        if (c.type === "remove") {
          if (!pendingIds.has(c.id)) removeNode(c.id);
        } else if (c.type === "dimensions" && c.resizing === false) {
          // Resize finished — read the settled node and persist its size
          // (and position, since corner handles can shift it).
          const node = useBoardStore
            .getState()
            .nodes.find((n) => n.id === c.id);
          const width =
            c.dimensions?.width ?? node?.width ?? node?.measured?.width;
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
  if (!ready) {
    return (
      <>
        <BoardAccessBar board={board} />
        <Loading />
      </>
    );
  }

  return (
    <div
      style={{ width: "100vw", height: "100vh" }}
      onPointerMove={(event) => {
        realtime.sendCursor(
          screenToFlowPosition({ x: event.clientX, y: event.clientY }),
        );
      }}
      onPointerLeave={() => realtime.sendCursor(null)}
    >
      <ReactFlow<CanvasNode>
        nodes={canvasNodes}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onDragOver={canEdit ? onDragOver : undefined}
        onDrop={canEdit ? onDrop : undefined}
        nodesDraggable={canEdit}
        deleteKeyCode={canEdit ? ["Backspace", "Delete"] : null}
        onNodeDrag={(_, __, dragged) => {
          if (!canEdit) return;
          realtime.sendDrag(
            dragged
              .filter((node) => node.type !== "pending")
              .map((node) => ({ id: node.id, position: node.position })),
          );
        }}
        onNodeDragStop={(_, __, dragged) => {
          if (!canEdit) return;
          dragged.forEach((n) => {
            if (n.type !== "pending") moveNode(n.id, n.position);
          });
        }}
        fitView
        proOptions={proOptions}
      >
        <Background gap={20} size={1} />
      </ReactFlow>
      <RealtimeCursors cursors={realtime.cursors} />
      <BoardAccessBar
        board={board}
        presence={
          board.isShared && (
            <RealtimePresence
              members={realtime.members}
              status={realtime.status}
            />
          )
        }
      />
      {canEdit && <NodeDock boardId={boardId} />}
      {canEdit && <TextEditorDrawer />}
      {canEdit && <ImageCropDialog boardId={boardId} />}
      <BoardCommandMenu
        open={commandOpen}
        onOpenChange={setCommandOpen}
        onSelectNode={onSelectSearchResult}
      />
      <DockMenu onSearch={() => setCommandOpen(true)} />
    </div>
  );
}

function BoardAccessBar({
  board,
  presence,
}: {
  board: BoardDetail;
  presence?: ReactNode;
}) {
  if (board.accessRole === "owner") {
    return (
      <div className="fixed top-4 right-24 z-50 flex items-center gap-2">
        <SharingDialog boardId={board.id} boardName={board.name} />
        {presence && (
          <div className="flex h-6 items-center rounded-md border bg-card px-1.5 shadow-sm">
            {presence}
          </div>
        )}
      </div>
    );
  }
  return (
    <div className="fixed top-4 right-24 z-50 flex h-6 items-center gap-2 rounded-md border bg-card px-2 text-xs font-medium shadow-sm">
      {board.accessRole === "viewer" ? "View only" : "Can edit"}
      {presence && (
        <>
          <span aria-hidden="true" className="h-3.5 w-px bg-border" />
          {presence}
        </>
      )}
    </div>
  );
}

function BackToBoardsButton() {
  return (
    <Button
      asChild
      variant="outline"
      size="sm"
      className="fixed top-4 left-4 z-50"
    >
      <Link href="/">← Boards</Link>
    </Button>
  );
}

/** Matches the board's own loading state so the handoff to `Board` is seamless. */
export function BoardLoading() {
  return (
    <>
      <BackToBoardsButton />
      <Loading />
    </>
  );
}

export function BoardNotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4">
      <p className="text-muted-foreground">This board doesn&rsquo;t exist.</p>
      <Button asChild variant="outline">
        <Link href="/">Back to boards</Link>
      </Button>
    </div>
  );
}

export function Board({
  board,
  focusNodeId,
}: {
  board: BoardDetail;
  focusNodeId?: string;
}) {
  const canEdit = board.accessRole !== "viewer";
  return (
    <ReactFlowProvider>
      <BoardPermissionsProvider canEdit={canEdit}>
        <BackToBoardsButton />
        <BoardCanvas
          board={board}
          focusNodeId={focusNodeId}
          canEdit={canEdit}
        />
      </BoardPermissionsProvider>
    </ReactFlowProvider>
  );
}
