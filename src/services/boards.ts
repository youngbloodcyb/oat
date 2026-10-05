"use server";

import {
  type BoardCleanup,
  workflowCleanUpBoard,
} from "@workflows/board-cleanup";
import { and, desc, eq, isNotNull, or } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { start } from "workflow/api";
import { db } from "@/db";
import { boardChats, boardShares, boards, nodes } from "@/db/schema";
import { requireUser } from "@/lib/auth-server";
import { nodeObjectKey } from "@/lib/blob";
import { publishDurableBoardEvent } from "@/lib/realtime-redis";
import { type BoardAccessRole, findBoardAccess } from "@/services/board-access";

export type AccessibleBoard = {
  id: string;
  name: string;
  createdAt: Date;
  accessRole: BoardAccessRole;
};

export async function listBoards(): Promise<AccessibleBoard[]> {
  const user = await requireUser();
  const rows = await db
    .select({
      id: boards.id,
      name: boards.name,
      createdAt: boards.createdAt,
      ownerId: boards.userId,
      sharedRole: boardShares.role,
    })
    .from(boards)
    .leftJoin(
      boardShares,
      and(eq(boardShares.boardId, boards.id), eq(boardShares.userId, user.id)),
    )
    .where(or(eq(boards.userId, user.id), isNotNull(boardShares.userId)))
    .orderBy(desc(boards.createdAt));
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    createdAt: row.createdAt,
    accessRole:
      row.ownerId === user.id ? "owner" : (row.sharedRole as BoardAccessRole),
  }));
}

export type BoardDetail = AccessibleBoard & { isShared: boolean };

export async function getBoard(boardId: string): Promise<BoardDetail | null> {
  const user = await requireUser();
  const access = await findBoardAccess(boardId, user.id);
  if (!access) return null;
  // Non-owners only have access through a share, so only owners need the lookup.
  const isShared =
    access.role !== "owner" ||
    (
      await db
        .select({ userId: boardShares.userId })
        .from(boardShares)
        .where(eq(boardShares.boardId, boardId))
        .limit(1)
    ).length > 0;
  return {
    id: access.board.id,
    name: access.board.name,
    createdAt: access.board.createdAt,
    accessRole: access.role,
    isShared,
  };
}

export async function createBoard(name: string): Promise<string> {
  const user = await requireUser();
  const id = crypto.randomUUID();
  await db.insert(boards).values({ id, userId: user.id, name });
  return id;
}

export async function updateBoard(
  boardId: string,
  patch: { name?: string },
  realtimeSourceId?: string,
): Promise<void> {
  const user = await requireUser();
  const result = await db
    .update(boards)
    .set(patch)
    .where(and(eq(boards.id, boardId), eq(boards.userId, user.id)));
  if (result.rowCount === 0) throw new Error("Board not found");
  await publishDurableBoardEvent({
    type: "board.updated",
    boardId,
    sourceId: realtimeSourceId,
    actorUserId: user.id,
  });
}

export async function deleteBoard(boardId: string): Promise<void> {
  const user = await requireUser();
  const cleanup: BoardCleanup = await db.transaction(async (tx) => {
    // Locking the row makes concurrent node and chat inserts (which check
    // the board foreign key) wait, then fail once it's gone, so nothing can
    // be added between collecting what to clean up and deleting.
    const owned = await tx
      .select({ id: boards.id })
      .from(boards)
      .where(and(eq(boards.id, boardId), eq(boards.userId, user.id)))
      .for("update")
      .limit(1);
    if (owned.length === 0) throw new Error("Board not found");

    const [nodeRows, chatRows] = await Promise.all([
      tx
        .select({ data: nodes.data })
        .from(nodes)
        .where(eq(nodes.boardId, boardId)),
      tx
        .select({ sessionId: boardChats.sessionId })
        .from(boardChats)
        .where(eq(boardChats.boardId, boardId)),
    ]);
    // Cascades to nodes, embeddings, shares, and chats.
    await tx.delete(boards).where(eq(boards.id, boardId));

    return {
      boardId,
      objectKeys: nodeRows
        .map((row) => nodeObjectKey(row.data))
        .filter((key): key is string => !!key),
      sessionIds: chatRows
        .map((row) => row.sessionId)
        .filter((id): id is string => !!id),
    };
  });

  revalidatePath("/");
  await publishDurableBoardEvent({
    type: "board.deleted",
    boardId,
    actorUserId: user.id,
  });
  try {
    await start(workflowCleanUpBoard, [cleanup]);
  } catch (error) {
    // The board is already gone; don't report the delete as failed.
    console.error("board cleanup workflow failed to start", {
      boardId,
      error,
    });
  }
}
