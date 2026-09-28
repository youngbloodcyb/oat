import type {
  ClientNode,
  ClientNodeData,
  NodeData,
  StoredNode,
} from "@/db/schema";

export function toClientNodeData(
  data: NodeData,
  nodeId: string,
): ClientNodeData {
  if (data.kind === "image") {
    return {
      kind: "image",
      src: data.objectKey ? `/api/files/${nodeId}` : (data.url ?? ""),
      alt: data.alt,
      fit: data.fit,
    };
  }
  if (data.kind === "pdf") {
    return {
      kind: "pdf",
      src: data.objectKey ? `/api/files/${nodeId}` : (data.url ?? ""),
      name: data.name,
    };
  }
  return data;
}

export function toClientNode(row: StoredNode): ClientNode {
  return {
    id: row.id,
    type: row.type,
    position: { x: row.positionX, y: row.positionY },
    style:
      row.width != null && row.height != null
        ? { width: row.width, height: row.height }
        : undefined,
    zIndex: row.zIndex ?? undefined,
    data: toClientNodeData(row.data, row.id),
  };
}
