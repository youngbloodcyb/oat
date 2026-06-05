import {
  applyNodeChanges,
  type Node,
  type NodeChange,
} from "@xyflow/react";
import type { FunctionReturnType } from "convex/server";
import { create } from "zustand";
import type { api } from "../../convex/_generated/api";

// Convex is the source of truth. These types are derived from what
// `nodes.listByBoard` returns — i.e. the resolved client view, where image/pdf
// `storageId | url` has already been collapsed into a `src` URL by the server.
export type ClientNode = FunctionReturnType<
  typeof api.nodes.listByBoard
>[number];
export type BoardNodeData = ClientNode["data"];

// Per-kind narrowing of the data union, handy for components.
export type LinkNodeData = Extract<BoardNodeData, { kind: "link" }>;
export type ImageNodeData = Extract<BoardNodeData, { kind: "image" }>;
export type PdfNodeData = Extract<BoardNodeData, { kind: "pdf" }>;
export type OgMeta = NonNullable<LinkNodeData["og"]>;

export type LinkNode = Node<LinkNodeData, "link">;
export type ImageNode = Node<ImageNodeData, "image">;
export type PdfNode = Node<PdfNodeData, "pdf">;

export type BoardNode = LinkNode | ImageNode | PdfNode;

// Default footprint per node kind, applied at creation time.
export const DEFAULT_STYLE: Record<
  BoardNodeData["kind"],
  { width: number; height: number }
> = {
  link: { width: 256, height: 280 },
  image: { width: 240, height: 240 },
  pdf: { width: 320, height: 400 },
};

/** Convex query row -> React Flow node (id comes from the Convex _id). */
export const toBoardNode = (doc: ClientNode): BoardNode =>
  ({
    id: doc._id,
    type: doc.type,
    position: doc.position,
    data: doc.data,
    style: doc.style,
  }) as BoardNode;

type BoardState = {
  nodes: BoardNode[];
  // Which board `nodes` currently belongs to. Lets the canvas avoid rendering
  // a previous board's nodes while a new board's query is still loading.
  nodesBoardId: string | null;
  selectedNode: BoardNode | null;
  // Replace local nodes with the latest server snapshot for `boardId`,
  // preserving transient React Flow UI state (selection, in-flight drag,
  // measurements) only when staying on the same board.
  setNodes: (boardId: string, incoming: BoardNode[]) => void;
  onNodesChange: (changes: NodeChange<BoardNode>[]) => void;
  // Local, optimistic data merge (persisted separately via a mutation).
  updateNodeData: <T extends BoardNodeData>(id: string, patch: Partial<T>) => void;
};

export const useBoardStore = create<BoardState>((set, get) => ({
  nodes: [],
  nodesBoardId: null,
  selectedNode: null,
  setNodes: (boardId, incoming) => {
    // Only carry over UI state when we're refreshing the same board; switching
    // boards must replace wholesale so nothing stale leaks across.
    const sameBoard = get().nodesBoardId === boardId;
    const prev = sameBoard
      ? new Map(get().nodes.map((n) => [n.id, n]))
      : null;
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
    const selectedNode = nodes.find((n) => n.selected) ?? null;
    set({ nodes, selectedNode, nodesBoardId: boardId });
  },
  onNodesChange: (changes) => {
    const nodes = applyNodeChanges(changes, get().nodes);
    const selectedNode = nodes.find((n) => n.selected) ?? null;
    set(
      selectedNode === get().selectedNode ? { nodes } : { nodes, selectedNode },
    );
  },
  updateNodeData: (id, patch) => {
    set({
      nodes: get().nodes.map((n) =>
        n.id === id ? ({ ...n, data: { ...n.data, ...patch } } as BoardNode) : n,
      ),
    });
  },
}));
