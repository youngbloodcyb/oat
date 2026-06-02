import {
  applyNodeChanges,
  type Node,
  type NodeChange,
  type XYPosition,
} from "@xyflow/react";
import { create } from "zustand";

export type OgMeta = {
  title?: string;
  description?: string;
  image?: string;
  siteName?: string;
};

export type LinkNodeData = {
  kind: "link";
  url: string;
  og?: OgMeta;
};

export type ImageNodeData = {
  kind: "image";
  src: string;
  alt?: string;
};

export type PdfNodeData = {
  kind: "pdf";
  src: string;
  name: string;
};

export type BoardNodeData = LinkNodeData | ImageNodeData | PdfNodeData;

export type LinkNode = Node<LinkNodeData, "link">;
export type ImageNode = Node<ImageNodeData, "image">;
export type PdfNode = Node<PdfNodeData, "pdf">;

export type BoardNode = LinkNode | ImageNode | PdfNode;

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
  switch (data.kind) {
    case "link":
      return {
        id,
        type: "link",
        position,
        data,
        initialWidth: 256,
        initialHeight: 280,
      };
    case "image":
      return {
        id,
        type: "image",
        position,
        data,
        initialWidth: 240,
        initialHeight: 240,
      };
    case "pdf":
      return {
        id,
        type: "pdf",
        position,
        data,
        initialWidth: 320,
        initialHeight: 400,
      };
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
