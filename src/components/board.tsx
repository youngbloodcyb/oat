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
import { useTheme } from "next-themes";
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
import { ImageCropDialog } from "@/components/image-crop-dialog";
import { Loading } from "@/components/loading";
import { NodeDock } from "@/components/node-dock";
import { nodeTypes } from "@/components/nodes";
import { NodeEntranceProvider } from "@/components/nodes/node-entrance";
import {
  RealtimeCursors,
  RealtimePresence,
} from "@/components/realtime-collaboration";
import { SearchButton } from "@/components/search-button";
import { SharingDialog } from "@/components/sharing-dialog";
import { TextEditorDrawer } from "@/components/text-editor-drawer";
import { Button } from "@/components/ui/button";
import { SidebarInset } from "@/components/ui/sidebar";
import { Skeleton } from "@/components/ui/skeleton";
import { UserMenu } from "@/components/user-menu";
import { useBoardActions } from "@/hooks/use-board-actions";
import { useBoardRealtime } from "@/hooks/use-board-realtime";
import { useBoardSync } from "@/hooks/use-board-sync";
import { useCanvasInputs } from "@/hooks/use-canvas-inputs";
import { type CanvasNode, useBoardStore } from "@/lib/store";
import type { SavedBoardChat } from "@/services/board-chats";
import type { BoardDetail } from "@/services/boards";
import type { NodeSearchResult } from "@/services/search";
import type { BoardShareMember } from "@/services/shares";

const proOptions = { hideAttribution: true };

function BoardCanvas({
  board,
  shares,
  focusNodeId,
  canEdit,
}: {
  board: BoardDetail;
  shares: BoardShareMember[];
  focusNodeId?: string;
  canEdit: boolean;
}) {
  const boardId = board.id;
  const router = useRouter();
  const { resolvedTheme } = useTheme();
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
        <Topbar board={board} shares={shares} />
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
          colorMode={resolvedTheme === "dark" ? "dark" : "light"}
          proOptions={proOptions}
        >
          <Background gap={20} size={1} />
        </ReactFlow>
      </NodeEntranceProvider>
      <RealtimeCursors cursors={realtime.cursors} />
      <Topbar
        board={board}
        shares={shares}
        onSearch={() => setCommandOpen(true)}
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
    </SidebarInset>
  );
}

/**
 * The board's topbar. Without a board it's the loading state: parts that
 * need the board's data are skeletons and the rest render disabled, at the
 * same sizes, so nothing shifts when the board arrives.
 */
function Topbar({
  board,
  shares = [],
  presence,
  onSearch,
}: {
  board?: BoardDetail;
  shares?: BoardShareMember[];
  presence?: ReactNode;
  /** Opens board search; the button stays disabled until the board is ready. */
  onSearch?: () => void;
}) {
  return (
    <AppTopbar
      left={<BackToBoardsButton />}
      center={
        board ? (
          <BoardTitle
            boardId={board.id}
            name={board.name}
            editable={board.accessRole === "owner"}
          />
        ) : (
          <Skeleton className="h-4 w-32" />
        )
      }
      right={
        <>
          {board && board.accessRole !== "owner" && (
            <span className="text-xs font-medium text-muted-foreground">
              {board.accessRole === "viewer" ? "View only" : "Can edit"}
            </span>
          )}
          {presence && (
            <div className="flex items-center gap-1.5">{presence}</div>
          )}
          <div className="flex items-center gap-1">
            <SearchButton onClick={onSearch} />
            {/* Held for while loading: only owners get it, but most boards
                opened are your own, so this keeps Search from jumping. */}
            {!board ? (
              <Skeleton className="size-6" />
            ) : (
              board.accessRole === "owner" && (
                <SharingDialog
                  boardId={board.id}
                  boardName={board.name}
                  members={shares}
                />
              )
            )}
            <ChatSidebarTrigger disabled={!board} />
          </div>
          <UserMenu />
        </>
      }
    />
  );
}

function BackToBoardsButton() {
  return (
    // Same lettering as the home page's topbar title.
    <Link
      href="/"
      className="font-mono text-sm font-medium uppercase transition-colors hover:text-muted-foreground"
    >
      oat.club ←
    </Link>
  );
}

/** Matches the board's own loading state so the handoff to `Board` is seamless. */
export function BoardLoading() {
  return (
    <>
      <Topbar />
      <Loading />
    </>
  );
}

export function BoardNotFound() {
  return (
    <div className="flex min-h-screen w-full flex-col items-center justify-center gap-4">
      <p className="text-muted-foreground">This board doesn&rsquo;t exist.</p>
      <Button asChild variant="outline">
        <Link href="/">Back to boards</Link>
      </Button>
    </div>
  );
}

export function Board({
  board,
  chat,
  shares,
  focusNodeId,
}: {
  board: BoardDetail;
  chat: SavedBoardChat | null;
  /** The board's share list; empty unless the caller owns the board. */
  shares: BoardShareMember[];
  focusNodeId?: string;
}) {
  const canEdit = board.accessRole !== "viewer";
  return (
    <ReactFlowProvider>
      <BoardPermissionsProvider canEdit={canEdit}>
        <BoardCanvas
          board={board}
          shares={shares}
          focusNodeId={focusNodeId}
          canEdit={canEdit}
        />
        <ChatSidebar boardId={board.id} boardName={board.name} chat={chat} />
      </BoardPermissionsProvider>
    </ReactFlowProvider>
  );
}
