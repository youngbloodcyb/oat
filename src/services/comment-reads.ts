import { asc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { comments, commentThreads, user as users } from "@/db/schema";
import type {
  BoardComment,
  BoardCommentThread,
  BoardCommentThreadMeta,
  CommentAuthor,
} from "@/lib/comments";

// Not a server action module: these skip access checks, so only server code
// that has already authorized the caller (server actions, agent tools) may
// import them.

export const authorColumns = {
  id: users.id,
  name: users.name,
  image: users.image,
};

export function toComment(row: {
  id: string;
  threadId: string;
  body: string;
  createdAt: Date;
  author: CommentAuthor;
}): BoardComment {
  return { ...row, createdAt: row.createdAt.toISOString() };
}

export function toThreadMeta(row: {
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

/** Every open thread on the board, oldest first, with its comments. */
export async function queryCommentThreads(
  boardId: string,
): Promise<BoardCommentThread[]> {
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
