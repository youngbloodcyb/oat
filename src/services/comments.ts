"use server";

import { asc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { comments, commentThreads, user as users } from "@/db/schema";
import { requireUser } from "@/lib/auth-server";
import {
  type BoardComment,
  type BoardCommentThread,
  type BoardCommentThreadMeta,
  type CommentAuthor,
  MAX_COMMENT_CHARS,
} from "@/lib/comments";
import { realtimePositionSchema } from "@/lib/realtime-protocol";
import { publishCommentEvent } from "@/lib/realtime-redis";
import { requireBoardAccess } from "@/services/board-access";

const idSchema = z.string().min(1).max(200);
const bodySchema = z.string().trim().min(1).max(MAX_COMMENT_CHARS);
// The client picks new ids so its optimistic copy and the realtime echo of
// the saved one share an id and merge.
const newIdSchema = z.uuid();

const authorColumns = {
  id: users.id,
  name: users.name,
  image: users.image,
};

function toComment(row: {
  id: string;
  threadId: string;
  body: string;
  createdAt: Date;
  author: CommentAuthor;
}): BoardComment {
  return { ...row, createdAt: row.createdAt.toISOString() };
}

function toThreadMeta(row: {
  id: string;
  boardId: string;
  positionX: number;
  positionY: number;
  createdAt: Date;
  author: CommentAuthor;
}): BoardCommentThreadMeta {
  return {
    id: row.id,
    boardId: row.boardId,
    position: { x: row.positionX, y: row.positionY },
    createdAt: row.createdAt.toISOString(),
    author: row.author,
  };
}

/** Loads a thread and checks the caller can at least view its board. */
async function requireThreadAccess(threadId: string, userId: string) {
  const rows = await db
    .select()
    .from(commentThreads)
    .where(eq(commentThreads.id, threadId))
    .limit(1);
  const thread = rows[0];
  if (!thread) throw new Error("Comment not found");
  const access = await requireBoardAccess(thread.boardId, userId, "view");
  return { thread, access };
}

export async function listCommentThreads(
  boardIdInput: string,
): Promise<BoardCommentThread[]> {
  const currentUser = await requireUser();
  const boardId = idSchema.parse(boardIdInput);
  await requireBoardAccess(boardId, currentUser.id, "view");

  const threadRows = await db
    .select({
      id: commentThreads.id,
      boardId: commentThreads.boardId,
      positionX: commentThreads.positionX,
      positionY: commentThreads.positionY,
      createdAt: commentThreads.createdAt,
      author: authorColumns,
    })
    .from(commentThreads)
    .innerJoin(users, eq(users.id, commentThreads.userId))
    .where(eq(commentThreads.boardId, boardId))
    .orderBy(asc(commentThreads.createdAt));
  if (threadRows.length === 0) return [];

  const commentRows = await db
    .select({
      id: comments.id,
      threadId: comments.threadId,
      body: comments.body,
      createdAt: comments.createdAt,
      author: authorColumns,
    })
    .from(comments)
    .innerJoin(users, eq(users.id, comments.userId))
    .where(
      inArray(
        comments.threadId,
        threadRows.map((thread) => thread.id),
      ),
    )
    .orderBy(asc(comments.createdAt));

  const byThread = new Map<string, BoardComment[]>();
  for (const row of commentRows) {
    const list = byThread.get(row.threadId) ?? [];
    list.push(toComment(row));
    byThread.set(row.threadId, list);
  }
  return threadRows.map((row) => ({
    ...toThreadMeta(row),
    comments: byThread.get(row.id) ?? [],
  }));
}

/** Pins a new comment to the board. Anyone who can view the board may comment. */
export async function createCommentThread(input: {
  threadId: string;
  commentId: string;
  boardId: string;
  position: { x: number; y: number };
  body: string;
}): Promise<BoardCommentThread> {
  const currentUser = await requireUser();
  const parsed = z
    .object({
      threadId: newIdSchema,
      commentId: newIdSchema,
      boardId: idSchema,
      position: realtimePositionSchema,
      body: bodySchema,
    })
    .parse(input);
  await requireBoardAccess(parsed.boardId, currentUser.id, "view");

  const createdAt = new Date();
  const { threadId, commentId } = parsed;
  await db.transaction(async (tx) => {
    await tx.insert(commentThreads).values({
      id: threadId,
      boardId: parsed.boardId,
      userId: currentUser.id,
      positionX: parsed.position.x,
      positionY: parsed.position.y,
      createdAt,
    });
    await tx.insert(comments).values({
      id: commentId,
      threadId,
      userId: currentUser.id,
      body: parsed.body,
      createdAt,
    });
  });

  const author: CommentAuthor = {
    id: currentUser.id,
    name: currentUser.name,
    image: currentUser.image ?? null,
  };
  const thread = toThreadMeta({
    id: threadId,
    boardId: parsed.boardId,
    positionX: parsed.position.x,
    positionY: parsed.position.y,
    createdAt,
    author,
  });
  const comment = toComment({
    id: commentId,
    threadId,
    body: parsed.body,
    createdAt,
    author,
  });
  await publishCommentEvent({
    type: "comment.added",
    boardId: parsed.boardId,
    thread,
    comment,
  });
  return { ...thread, comments: [comment] };
}

export async function replyToCommentThread(input: {
  threadId: string;
  commentId: string;
  body: string;
}): Promise<BoardComment> {
  const currentUser = await requireUser();
  const parsed = z
    .object({ threadId: idSchema, commentId: newIdSchema, body: bodySchema })
    .parse(input);
  const { thread } = await requireThreadAccess(parsed.threadId, currentUser.id);

  const createdAt = new Date();
  const { commentId } = parsed;
  await db.insert(comments).values({
    id: commentId,
    threadId: thread.id,
    userId: currentUser.id,
    body: parsed.body,
    createdAt,
  });

  const authorRows = await db
    .select(authorColumns)
    .from(users)
    .where(eq(users.id, thread.userId))
    .limit(1);
  const threadAuthor = authorRows[0];
  if (!threadAuthor) throw new Error("Comment not found");

  const comment = toComment({
    id: commentId,
    threadId: thread.id,
    body: parsed.body,
    createdAt,
    author: {
      id: currentUser.id,
      name: currentUser.name,
      image: currentUser.image ?? null,
    },
  });
  await publishCommentEvent({
    type: "comment.added",
    boardId: thread.boardId,
    thread: toThreadMeta({ ...thread, author: threadAuthor }),
    comment,
  });
  return comment;
}

/**
 * Resolves a thread, deleting it and its replies. Editors and the owner can
 * resolve any thread; viewers only the ones they started.
 */
export async function resolveCommentThread(input: {
  threadId: string;
}): Promise<void> {
  const currentUser = await requireUser();
  const threadId = idSchema.parse(input.threadId);
  const { thread, access } = await requireThreadAccess(
    threadId,
    currentUser.id,
  );
  if (access.role === "viewer" && thread.userId !== currentUser.id) {
    throw new Error("Forbidden");
  }

  await db.delete(commentThreads).where(eq(commentThreads.id, thread.id));
  await publishCommentEvent({
    type: "comment.resolved",
    boardId: thread.boardId,
    threadId: thread.id,
  });
}
