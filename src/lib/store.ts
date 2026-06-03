import {
  applyNodeChanges,
  type Node,
  type NodeChange,
  type XYPosition,
} from "@xyflow/react";
import { create } from "zustand";
import type { Doc } from "../../convex/_generated/dataModel";

// The persisted node document, straight from the Convex schema. The node
// `data` validator (convex/schema.ts) is the single source of truth for
// shape — these types are derived from it, not hand-maintained.
export type NodeDoc = Doc<"nodes">;
export type BoardNodeData = NodeDoc["data"];

// Per-kind narrowing of the data union, handy for components.
export type LinkNodeData = Extract<BoardNodeData, { kind: "link" }>;
export type ImageNodeData = Extract<BoardNodeData, { kind: "image" }>;
export type PdfNodeData = Extract<BoardNodeData, { kind: "pdf" }>;
export type OgMeta = NonNullable<LinkNodeData["og"]>;

export type LinkNode = Node<LinkNodeData, "link">;
export type ImageNode = Node<ImageNodeData, "image">;
export type PdfNode = Node<PdfNodeData, "pdf">;

export type BoardNode = LinkNode | ImageNode | PdfNode;

// --- Boundary helpers: React Flow <-> Convex --------------------------------
// We persist only the durable subset of a React Flow node and reconstruct
// the rest on read. UI/runtime state (selected, dragging, measured, etc.) is
// intentionally dropped — it's recomputed by React Flow, not stored.

const persistStyle = (
  style: BoardNode["style"],
): { width: number; height: number } | undefined =>
  style && typeof style.width === "number" && typeof style.height === "number"
    ? { width: style.width, height: style.height }
    : undefined;

/** Convex doc -> React Flow node. */
export const toBoardNode = (doc: NodeDoc): BoardNode =>
  ({
    id: doc._id,
    type: doc.type,
    position: doc.position,
    data: doc.data,
    style: doc.style,
  }) as BoardNode;

/** React Flow node -> args for the `nodes.create` / `nodes.update` mutations. */
export const toPersisted = (node: BoardNode) => ({
  type: node.data.kind,
  position: node.position,
  data: node.data,
  style: persistStyle(node.style),
});

const DEFAULT_STYLE: Record<BoardNodeData["kind"], { width: number; height: number }> = {
  link: { width: 256, height: 280 },
  image: { width: 240, height: 240 },
  pdf: { width: 320, height: 400 },
};

type BoardState = {
  nodes: BoardNode[];
  selectedNode: BoardNode | null;
  onNodesChange: (changes: NodeChange<BoardNode>[]) => void;
  addNode: (data: BoardNodeData, position: XYPosition) => string;
  updateNodeData: <T extends BoardNodeData>(
    id: string,
    patch: Partial<T>,
  ) => void;
};

const makeNode = (data: BoardNodeData, position: XYPosition): BoardNode => {
  const id = crypto.randomUUID();
  const style = DEFAULT_STYLE[data.kind];
  switch (data.kind) {
    case "link":
      return { id, type: "link", position, data, style };
    case "image":
      return { id, type: "image", position, data, style };
    case "pdf":
      return { id, type: "pdf", position, data, style };
  }
};

export const useBoardStore = create<BoardState>((set, get) => ({
  nodes: [],
  selectedNode: null,
  onNodesChange: (changes) => {
    for (const c of changes) {
      if (c.type !== "remove") continue;
      const node = get().nodes.find((n) => n.id === c.id);
      if (!node) continue;
      if (node.data.kind === "image" || node.data.kind === "pdf") {
        if (node.data.src.startsWith("blob:")) {
          URL.revokeObjectURL(node.data.src);
        }
      }
    }
    const nodes = applyNodeChanges(changes, get().nodes);
    const selectedNode = nodes.find((n) => n.selected) ?? null;
    set(
      selectedNode === get().selectedNode ? { nodes } : { nodes, selectedNode },
    );
  },
  addNode: (data, position) => {
    const node = makeNode(data, position);
    set({ nodes: [...get().nodes, node] });
    return node.id;
  },
  updateNodeData: (id, patch) => {
    set({
      nodes: get().nodes.map((n) =>
        n.id === id ? ({ ...n, data: { ...n.data, ...patch } } as BoardNode) : n,
      ),
    });
  },
}));
