import { workflowEmbedNode } from "@workflows/embed";
import { start } from "workflow/api";
import { db } from "@/db";
import {
  type ClientNode,
  type NodeData,
  type NodeType,
  nodes,
} from "@/db/schema";
import { blobExists, nodeObjectKey, uploadKeyPrefix } from "@/lib/blob";
import { toClientNodeData } from "@/lib/client-node";
import { nodeEmbeddingSourceKey } from "@/lib/embedding-source";
import { nodeSearchText } from "@/lib/node-search";
import { publishDurableBoardEvent } from "@/lib/realtime-redis";
import { requireBoardAccess } from "@/services/board-access";

// Not a server action module: these take a trusted `userId`, so only server
// code that has already authenticated the caller (server actions, agent
// tools) may import them.

export async function scheduleNodeEmbedding(nodeId: string): Promise<void> {
  try {
    await start(workflowEmbedNode, [nodeId]);
  } catch (error) {
    console.error("embedding workflow failed to start", { nodeId, error });
  }
}

/** Creates a node on a board the user can edit and announces it to viewers. */
export async function insertNode(input: {
  userId: string;
  boardId: string;
  type: NodeType;
  position: { x: number; y: number };
  data: NodeData;
  style?: { width: number; height: number };
  zIndex?: number;
  realtimeSourceId?: string;
}): Promise<ClientNode> {
  const { board } = await requireBoardAccess(
    input.boardId,
    input.userId,
    "edit",
  );

  const key = nodeObjectKey(input.data);
  if (key) {
    if (!key.startsWith(uploadKeyPrefix(input.userId, input.boardId))) {
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
  const node: ClientNode = {
    id,
    type: input.type,
    position: input.position,
    style: input.style,
    zIndex: input.zIndex,
    data: toClientNodeData(input.data, id),
  };
  await publishDurableBoardEvent({
    type: "node.created",
    boardId: input.boardId,
    sourceId: input.realtimeSourceId,
    actorUserId: input.userId,
    node,
  });
  if (embeddingSource) await scheduleNodeEmbedding(id);
  return node;
}
