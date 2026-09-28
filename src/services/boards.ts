"use server";

import { and, desc, eq, isNotNull, or } from "drizzle-orm";
import { db } from "@/db";
import { boardShares, boards, nodes } from "@/db/schema";
import { requireUser } from "@/lib/auth-server";
import { deleteBlob, nodeObjectKey } from "@/lib/blob";
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
  const owned = and(eq(boards.id, boardId), eq(boards.userId, user.id));
  const rows = await db
    .select({ data: nodes.data })
    .from(nodes)
    .where(eq(nodes.boardId, boardId));
  const keys = rows
    .map((r) => nodeObjectKey(r.data as { kind: string; objectKey?: string }))
    .filter((k): k is string => !!k);
  const result = await db.delete(boards).where(owned);
  if (result.rowCount === 0) throw new Error("Board not found");
  await publishDurableBoardEvent({
    type: "board.deleted",
    boardId,
    actorUserId: user.id,
  });
  await Promise.all(keys.map(deleteBlob));
}
