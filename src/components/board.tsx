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
import { AppTopbar } from "@/components/app-topbar";
import { BoardCommandMenu } from "@/components/board-command-menu";
import { BoardPermissionsProvider } from "@/components/board-permissions";
import { BoardTitle } from "@/components/board-title";
import { ChatSidebar, ChatSidebarTrigger } from "@/components/chat-sidebar";
import { DockMenu } from "@/components/dock-menu";
import { ImageCropDialog } from "@/components/image-crop-dialog";
import { Loading } from "@/components/loading";
import { NodeDock } from "@/components/node-dock";
import { nodeTypes } from "@/components/nodes";
import { NodeEntranceProvider } from "@/components/nodes/node-entrance";
import {
  RealtimeCursors,
  RealtimePresence,
} from "@/components/realtime-collaboration";
import { SharingDialog } from "@/components/sharing-dialog";
import { SignOutButton } from "@/components/sign-out-button";
import { TextEditorDrawer } from "@/components/text-editor-drawer";
import { Button } from "@/components/ui/button";
import { SidebarInset } from "@/components/ui/sidebar";
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
        <Topbar board={board} />
        <Loading />
      </>
    );
  }

  return (
    <SidebarInset
      className="relative h-svh w-full overflow-hidden transition-[width] duration-200 ease-linear"
      onPointerMove={(event) => {
        realtime.sendCursor(
          screenToFlowPosition({ x: event.clientX, y: event.clientY }),
        );
      }}
      onPointerLeave={() => realtime.sendCursor(null)}
    >
      <NodeEntranceProvider nodeIds={nodes.map((n) => n.id)}>
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
      </NodeEntranceProvider>
      <RealtimeCursors cursors={realtime.cursors} />
      <Topbar
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
        boardId={boardId}
        open={commandOpen}
        onOpenChange={setCommandOpen}
        onSelectNode={onSelectSearchResult}
      />
      <DockMenu onSearch={() => setCommandOpen(true)} />
    </SidebarInset>
  );
}

function Topbar({
  board,
  presence,
}: {
  board: BoardDetail;
  presence?: ReactNode;
}) {
  return (
    <AppTopbar
      left={<BackToBoardsButton />}
      center={
        <BoardTitle
          boardId={board.id}
          name={board.name}
          editable={board.accessRole === "owner"}
        />
      }
      right={
        <>
          <span className="text-xs font-medium text-muted-foreground">
            {board.accessRole === "owner"
              ? null
              : board.accessRole === "viewer"
                ? "View only"
                : "Can edit"}
          </span>
          {presence && (
            <div className="flex items-center gap-1.5">{presence}</div>
          )}
          {board.accessRole === "owner" && (
            <SharingDialog boardId={board.id} boardName={board.name} />
          )}
          <ChatSidebarTrigger />
          <SignOutButton />
        </>
      }
    />
  );
}

function BackToBoardsButton() {
  return (
    <Button asChild variant="outline" size="sm">
      <Link href="/">← Home</Link>
    </Button>
  );
}

/** Matches the board's own loading state so the handoff to `Board` is seamless. */
export function BoardLoading() {
  return (
    <>
      <AppTopbar left={<BackToBoardsButton />} />
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
        <BoardCanvas
          board={board}
          focusNodeId={focusNodeId}
          canEdit={canEdit}
        />
        <ChatSidebar />
      </BoardPermissionsProvider>
    </ReactFlowProvider>
  );
}
