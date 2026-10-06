"use server";

import { workflowEmbedNode } from "@workflows/embed";
import { eq } from "drizzle-orm";
import { start } from "workflow/api";
import { db } from "@/db";
import {
  type ClientNode,
  type NodeData,
  type NodeType,
  nodes,
} from "@/db/schema";
import { requireUser } from "@/lib/auth-server";
import {
  blobExists,
  copyBlob,
  deleteBlob,
  nodeObjectKey,
  objectKeyFor,
  uploadKeyPrefix,
} from "@/lib/blob";
import { toClientNode, toClientNodeData } from "@/lib/client-node";
import { nodeEmbeddingSourceKey } from "@/lib/embedding-source";
import { nodeSearchText } from "@/lib/node-search";
import { publishDurableBoardEvent } from "@/lib/realtime-redis";
import { requireBoardAccess, requireNodeAccess } from "@/services/board-access";

async function scheduleNodeEmbedding(nodeId: string): Promise<void> {
  try {
    await start(workflowEmbedNode, [nodeId]);
  } catch (error) {
    console.error("embedding workflow failed to start", { nodeId, error });
  }
}

export async function listNodesByBoard(boardId: string): Promise<ClientNode[]> {
  const user = await requireUser();
  await requireBoardAccess(boardId, user.id, "view");
  const rows = await db.select().from(nodes).where(eq(nodes.boardId, boardId));
  return rows.map(toClientNode);
}

export async function createNode(input: {
  boardId: string;
  type: NodeType;
  position: { x: number; y: number };
  data: NodeData;
  style?: { width: number; height: number };
  zIndex?: number;
  realtimeSourceId?: string;
}): Promise<string> {
  const user = await requireUser();
  const { board } = await requireBoardAccess(input.boardId, user.id, "edit");

  const key = nodeObjectKey(input.data);
  if (key) {
    if (!key.startsWith(uploadKeyPrefix(user.id, input.boardId))) {
      throw new Error("Upload does not belong to this board");
    }
    const exists = await blobExists(key);
    if (!exists) throw new Error("Upload not found");
  }

  const id = crypto.randomUUID();
  const searchText = nodeSearchText(input.data);
  const embeddingSource = nodeEmbeddingSourceKey(input.data, searchText);
  await db.insert(nodes).values({
    id,
    boardId: input.boardId,
    userId: board.userId,
    type: input.type,
    positionX: input.position.x,
    positionY: input.position.y,
    width: input.style?.width,
    height: input.style?.height,
    data: input.data,
    zIndex: input.zIndex,
    searchText,
    embeddingSource,
  });
  await publishDurableBoardEvent({
    type: "node.created",
    boardId: input.boardId,
    sourceId: input.realtimeSourceId,
    actorUserId: user.id,
    node: {
      id,
      type: input.type,
      position: input.position,
      style: input.style,
      zIndex: input.zIndex,
      data: toClientNodeData(input.data, id),
    },
  });
  if (embeddingSource) await scheduleNodeEmbedding(id);
  return id;
}

export async function updateNode(input: {
  nodeId: string;
  position?: { x: number; y: number };
  data?: NodeData;
  style?: { width: number; height: number };
  zIndex?: number;
  realtimeSourceId?: string;
}): Promise<void> {
  const user = await requireUser();
  const { node } = await requireNodeAccess(input.nodeId, user.id, "edit");
  const set: Record<string, unknown> = { updatedAt: new Date() };
  if (input.position) {
    set.positionX = input.position.x;
    set.positionY = input.position.y;
  }
  if (input.data) {
    const searchText = nodeSearchText(input.data);
    set.data = input.data;
    set.searchText = searchText;
    set.embeddingSource = nodeEmbeddingSourceKey(input.data, searchText);
  }
  if (input.style) {
    set.width = input.style.width;
    set.height = input.style.height;
  }
  if (input.zIndex !== undefined) set.zIndex = input.zIndex;
  const result = await db
    .update(nodes)
    .set(set)
    .where(eq(nodes.id, input.nodeId));
  if (result.rowCount === 0) throw new Error("Node not found");
  await publishDurableBoardEvent({
    type: "node.updated",
    boardId: node.boardId,
    sourceId: input.realtimeSourceId,
    actorUserId: user.id,
    node: toClientNode({
      ...node,
      positionX: input.position?.x ?? node.positionX,
      positionY: input.position?.y ?? node.positionY,
      width: input.style?.width ?? node.width,
      height: input.style?.height ?? node.height,
      zIndex: input.zIndex ?? node.zIndex,
      data: input.data ?? node.data,
      searchText:
        typeof set.searchText === "string" ? set.searchText : node.searchText,
      embeddingSource:
        typeof set.embeddingSource === "string" || set.embeddingSource === null
          ? set.embeddingSource
          : node.embeddingSource,
      updatedAt: set.updatedAt as Date,
    }),
  });
  if (input.data) await scheduleNodeEmbedding(input.nodeId);
}

export async function patchImageNode(input: {
  nodeId: string;
  fit?: "cover" | "contain";
  objectKey?: string;
  realtimeSourceId?: string;
}): Promise<void> {
  const user = await requireUser();
  const { node } = await requireNodeAccess(input.nodeId, user.id, "edit");
  if (node.data.kind !== "image") return;

  const next = { ...node.data };
  let oldKey: string | undefined;
  if (input.fit !== undefined) next.fit = input.fit;
  if (input.objectKey !== undefined) {
    if (!input.objectKey.startsWith(uploadKeyPrefix(user.id, node.boardId))) {
      throw new Error("Upload does not belong to this board");
    }
    if (!(await blobExists(input.objectKey))) {
      throw new Error("Upload not found");
    }
    if (next.objectKey) oldKey = next.objectKey;
    next.objectKey = input.objectKey;
    next.url = undefined;
  }

  const searchText = nodeSearchText(next);
  const embeddingSource = nodeEmbeddingSourceKey(next, searchText);

  const result = await db
    .update(nodes)
    .set({
      data: next,
      searchText,
      embeddingSource,
      updatedAt: new Date(),
    })
    .where(eq(nodes.id, input.nodeId));
  if (result.rowCount === 0) throw new Error("Node not found");

  await publishDurableBoardEvent({
    type: "node.updated",
    boardId: node.boardId,
    sourceId: input.realtimeSourceId,
    actorUserId: user.id,
    node: toClientNode({
      ...node,
      data: next,
      searchText,
      embeddingSource,
      updatedAt: new Date(),
    }),
  });

  if (input.objectKey !== undefined) await scheduleNodeEmbedding(input.nodeId);
  if (oldKey) await deleteBlob(oldKey);
}

export async function removeNode(
  nodeId: string,
  realtimeSourceId?: string,
): Promise<void> {
  const user = await requireUser();
  const { node } = await requireNodeAccess(nodeId, user.id, "edit");
  const key = nodeObjectKey(node.data as NodeData);
  const result = await db.delete(nodes).where(eq(nodes.id, nodeId));
  if (result.rowCount === 0) throw new Error("Node not found");
  await publishDurableBoardEvent({
    type: "node.deleted",
    boardId: node.boardId,
    sourceId: realtimeSourceId,
    actorUserId: user.id,
    nodeId,
  });
  if (key) await deleteBlob(key);
}

export async function duplicateNode(input: {
  nodeId: string;
  boardId: string;
  position: { x: number; y: number };
  style?: { width: number; height: number };
  realtimeSourceId?: string;
}): Promise<string> {
  const user = await requireUser();
  const { node: src } = await requireNodeAccess(input.nodeId, user.id, "edit");
  const { board } = await requireBoardAccess(input.boardId, user.id, "edit");
  const id = crypto.randomUUID();

  // Each node owns its blob (removeNode deletes it), so duplicates need their own copy.
  const srcKey = nodeObjectKey(src.data);
  const copiedKey = srcKey
    ? await copyBlob(srcKey, objectKeyFor(user.id, input.boardId))
    : undefined;
  const data = (
    copiedKey ? { ...src.data, objectKey: copiedKey } : src.data
  ) as NodeData;

  const searchText = nodeSearchText(data);
  const embeddingSource = nodeEmbeddingSourceKey(data, searchText);
  try {
    await db.insert(nodes).values({
      id,
      boardId: input.boardId,
      userId: board.userId,
      type: src.type,
      positionX: input.position.x,
      positionY: input.position.y,
      width: input.style?.width ?? src.width ?? undefined,
      height: input.style?.height ?? src.height ?? undefined,
      zIndex: src.zIndex ?? undefined,
      data,
      searchText,
      embeddingSource,
    });
  } catch (error) {
    if (copiedKey) await deleteBlob(copiedKey);
    throw error;
  }
  await publishDurableBoardEvent({
    type: "node.created",
    boardId: input.boardId,
    sourceId: input.realtimeSourceId,
    actorUserId: user.id,
    node: {
      id,
      type: src.type,
      position: input.position,
      style:
        input.style ??
        (src.width != null && src.height != null
          ? { width: src.width, height: src.height }
          : undefined),
      zIndex: src.zIndex ?? undefined,
      data: toClientNodeData(data, id),
    },
  });
  if (embeddingSource) await scheduleNodeEmbedding(id);
  return id;
}
