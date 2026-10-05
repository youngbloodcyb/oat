import { applyNodeChanges, type Node, type NodeChange } from "@xyflow/react";
import { create } from "zustand";
import type { ClientNode, NodeData } from "@/db/schema";
import { DEFAULT_STYLE } from "@/lib/node-style";

// The server (drizzle via src/services) is the source of truth. These types
// match the resolved client view returned by `listNodesByBoard`, where
// image/pdf `objectKey | url` has already been collapsed into a `src` URL.
export type BoardNodeData = ClientNode["data"];

// Per-kind narrowing of the data union, handy for components.
export type LinkNodeData = Extract<BoardNodeData, { kind: "link" }>;
export type TextNodeData = Extract<BoardNodeData, { kind: "text" }>;
export type ImageNodeData = Extract<BoardNodeData, { kind: "image" }>;
export type PdfNodeData = Extract<BoardNodeData, { kind: "pdf" }>;
export type OgMeta = NonNullable<LinkNodeData["og"]>;

// Kinds whose client and stored data shapes are identical, so they can be
// edited in place (image/pdf differ — objectKey/url vs resolved src).
export type EditableNodeData = LinkNodeData | TextNodeData;

export type LinkNode = Node<LinkNodeData, "link">;
export type TextNode = Node<TextNodeData, "text">;
export type ImageNode = Node<ImageNodeData, "image">;
export type PdfNode = Node<PdfNodeData, "pdf">;

export type BoardNode = LinkNode | TextNode | ImageNode | PdfNode;

export type PendingNodePreview =
  | { kind: "link"; url: string }
  | { kind: "text"; text: string }
  | { kind: "image"; src: string; alt: string }
  | { kind: "pdf"; src: string; name: string };

export type PendingNodeData = {
  kind: "pending";
  boardId: string;
  preview: PendingNodePreview;
  phase: "uploading" | "saving" | "failed";
  progress?: number;
  error?: string;
  onRetry?: () => void;
  onRemove: () => void;
};

export type PendingNode = Node<PendingNodeData, "pending">;
export type CanvasNode = BoardNode | PendingNode;

export { DEFAULT_STYLE };

// The single selected node, or null when nothing — or more than one — is
// selected. The node dock is a single-node inspector, so it stays hidden
// unless exactly one node is selected.
const soleSelected = (nodes: BoardNode[]): BoardNode | null => {
  const selected = nodes.filter((n) => n.selected);
  return selected.length === 1 ? selected[0] : null;
};

const isPendingNode = (node: CanvasNode): node is PendingNode =>
  node.type === "pending";

const isBoardNode = (node: CanvasNode): node is BoardNode =>
  node.type !== "pending";

function revokePendingPreview(node: PendingNode) {
  const preview = node.data.preview;
  if (
    (preview.kind === "image" || preview.kind === "pdf") &&
    preview.src.startsWith("blob:") &&
    typeof URL.revokeObjectURL === "function"
  ) {
    URL.revokeObjectURL(preview.src);
  }
}

/** Server row -> React Flow node (id comes from the row's id). */
export const toBoardNode = (doc: ClientNode): BoardNode =>
  ({
    id: doc.id,
    type: doc.type,
    position: doc.position,
    data: doc.data,
    style: doc.style,
    zIndex: doc.zIndex,
  }) as BoardNode;

/** STORED node data -> the client shape the canvas renders (image/pdf src). */
export const toClientNodeData = (
  data: NodeData,
  nodeId: string,
): BoardNodeData => {
  switch (data.kind) {
    case "image":
      return {
        kind: "image",
        src: data.objectKey ? `/api/files/${nodeId}` : (data.url ?? ""),
        alt: data.alt,
        fit: data.fit,
      };
    case "pdf":
      return {
        kind: "pdf",
        src: data.objectKey ? `/api/files/${nodeId}` : (data.url ?? ""),
        name: data.name,
      };
    default:
      return data;
  }
};

/** Current rendered size of a node, falling back to its kind's default. */
export const nodeSize = (
  node: BoardNode,
): { width: number; height: number } => {
  const style = node.style as { width?: number; height?: number } | undefined;
  const def = DEFAULT_STYLE[node.type];
  return {
    width: node.measured?.width ?? style?.width ?? def.width,
    height: node.measured?.height ?? style?.height ?? def.height,
  };
};

type BoardState = {
  nodes: BoardNode[];
  // Client-only nodes shown while an upload/server mutation is in flight.
  // Keeping these separate prevents a server snapshot from dropping them.
  pendingNodes: PendingNode[];
  // Which board `nodes` currently belongs to. Lets the canvas avoid rendering
  // a previous board's nodes while a new board's query is still loading.
  nodesBoardId: string | null;
  selectedNode: BoardNode | null;
  // The text node currently open in the editor drawer (null = drawer closed).
  editingTextNodeId: string | null;
  openTextEditor: (id: string) => void;
  closeTextEditor: () => void;
  // The image node currently open in the crop dialog (null = closed).
  croppingImageNodeId: string | null;
  openImageCrop: (id: string) => void;
  closeImageCrop: () => void;
  // Replace local nodes with the latest server snapshot for `boardId`,
  // preserving transient React Flow UI state (selection, in-flight drag,
  // measurements) only when staying on the same board.
  setNodes: (boardId: string, incoming: BoardNode[]) => void;
  onNodesChange: (changes: NodeChange<CanvasNode>[]) => void;
  // Select exactly one persisted node. Returns false when it is not loaded.
  selectNode: (id: string) => boolean;
  addPendingNode: (node: PendingNode) => void;
  updatePendingNode: (id: string, patch: Partial<PendingNodeData>) => void;
  removePendingNode: (id: string) => void;
  promotePendingNode: (id: string, node: BoardNode) => boolean;
  upsertRemoteNode: (node: BoardNode) => void;
  removeRemoteNode: (id: string) => void;
  previewRemoteNodePositions: (
    nodes: Array<{ id: string; position: { x: number; y: number } }>,
  ) => void;
  // Local, optimistic data merge (persisted separately via a mutation).
  updateNodeData: (id: string, patch: Partial<BoardNodeData>) => void;
};

export const useBoardStore = create<BoardState>((set, get) => ({
  nodes: [],
  pendingNodes: [],
  nodesBoardId: null,
  selectedNode: null,
  editingTextNodeId: null,
  openTextEditor: (id) => set({ editingTextNodeId: id }),
  closeTextEditor: () => set({ editingTextNodeId: null }),
  croppingImageNodeId: null,
  openImageCrop: (id) => set({ croppingImageNodeId: id }),
  closeImageCrop: () => set({ croppingImageNodeId: null }),
  setNodes: (boardId, incoming) => {
    // Only carry over UI state when we're refreshing the same board; switching
    // boards must replace wholesale so nothing stale leaks across.
    const sameBoard = get().nodesBoardId === boardId;
    const prev = sameBoard ? new Map(get().nodes.map((n) => [n.id, n])) : null;
    const nodes = incoming.map((n) => {
      const old = prev?.get(n.id);
      if (!old) return n;
      return {
        ...old,
        ...n,
        // Keep UI-only state that the server doesn't know about.
        selected: old.selected,
        dragging: old.dragging,
        measured: old.measured,
        // Don't let a server snapshot yank a node out from under an active drag.
        position: old.dragging ? old.position : n.position,
      } as BoardNode;
    });
    const pendingNodes = get().pendingNodes.filter(
      (pending) => pending.data.boardId === boardId,
    );
    for (const pending of get().pendingNodes) {
      if (pending.data.boardId !== boardId) revokePendingPreview(pending);
    }
    set({
      nodes,
      pendingNodes,
      selectedNode: soleSelected(nodes),
      nodesBoardId: boardId,
    });
  },
  onNodesChange: (changes) => {
    const changed = applyNodeChanges(changes, [
      ...get().nodes,
      ...get().pendingNodes,
    ]);
    const nodes = changed.filter(isBoardNode);
    const pendingNodes = changed.filter(isPendingNode);
    const selectedNode = soleSelected(nodes);
    set(
      selectedNode === get().selectedNode
        ? { nodes, pendingNodes }
        : { nodes, pendingNodes, selectedNode },
    );
  },
  selectNode: (id) => {
    const selectedNode = get().nodes.find((node) => node.id === id);
    if (!selectedNode) return false;

    const nodes = get().nodes.map((node) => ({
      ...node,
      selected: node.id === id,
    })) as BoardNode[];
    const pendingNodes = get().pendingNodes.map((node) => ({
      ...node,
      selected: false,
    })) as PendingNode[];
    set({
      nodes,
      pendingNodes,
      selectedNode: nodes.find((node) => node.id === id) ?? null,
    });
    return true;
  },
  addPendingNode: (node) =>
    set({ pendingNodes: [...get().pendingNodes, node] }),
  updatePendingNode: (id, patch) =>
    set({
      pendingNodes: get().pendingNodes.map((node) =>
        node.id === id ? { ...node, data: { ...node.data, ...patch } } : node,
      ),
    }),
  removePendingNode: (id) => {
    const pending = get().pendingNodes.find((node) => node.id === id);
    if (pending) revokePendingPreview(pending);
    set({
      pendingNodes: get().pendingNodes.filter((node) => node.id !== id),
    });
  },
  promotePendingNode: (id, node) => {
    const pending = get().pendingNodes.find((candidate) => candidate.id === id);
    if (!pending) return false;
    revokePendingPreview(pending);
    const existingIndex = get().nodes.findIndex(
      (candidate) => candidate.id === node.id,
    );
    const nodes =
      existingIndex === -1
        ? [...get().nodes, node]
        : get().nodes.map((candidate, index) =>
            index === existingIndex ? { ...candidate, ...node } : candidate,
          );
    set({
      nodes,
      pendingNodes: get().pendingNodes.filter(
        (candidate) => candidate.id !== id,
      ),
    });
    return true;
  },
  upsertRemoteNode: (incoming) => {
    const existing = get().nodes.find((node) => node.id === incoming.id);
    const next = existing
      ? ({
          ...existing,
          ...incoming,
          selected: existing.selected,
          dragging: existing.dragging,
          measured: existing.measured,
          position: existing.dragging ? existing.position : incoming.position,
        } as BoardNode)
      : incoming;
    const nodes = existing
      ? get().nodes.map((node) => (node.id === incoming.id ? next : node))
      : [...get().nodes, next];
    set({
      nodes,
      selectedNode:
        get().selectedNode?.id === incoming.id ? next : get().selectedNode,
    });
  },
  removeRemoteNode: (id) => {
    set({
      nodes: get().nodes.filter((node) => node.id !== id),
      selectedNode: get().selectedNode?.id === id ? null : get().selectedNode,
      editingTextNodeId:
        get().editingTextNodeId === id ? null : get().editingTextNodeId,
      croppingImageNodeId:
        get().croppingImageNodeId === id ? null : get().croppingImageNodeId,
    });
  },
  previewRemoteNodePositions: (incoming) => {
    const positions = new Map(incoming.map((item) => [item.id, item.position]));
    set({
      nodes: get().nodes.map((node) => {
        const position = positions.get(node.id);
        return position && !node.dragging ? { ...node, position } : node;
      }) as BoardNode[],
    });
  },
  updateNodeData: (id, patch) => {
    set({
      nodes: get().nodes.map((n) =>
        n.id === id
          ? ({ ...n, data: { ...n.data, ...patch } } as BoardNode)
          : n,
      ),
    });
  },
}));
