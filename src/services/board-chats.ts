"use server";

import { and, asc, eq, isNull, sql } from "drizzle-orm";
import type { MessageStreamEvent } from "eve/client";
import { z } from "zod";
import { db } from "@/db";
import { boardChatEvents, boardChats } from "@/db/schema";
import { requireUser } from "@/lib/auth-server";
import { requireBoardAccess } from "@/services/board-access";

const boardIdSchema = z.string().min(1).max(200);
const sessionIdSchema = z.string().min(1).max(200);
const MAX_EVENTS_PER_APPEND = 2_000;
const MAX_APPEND_BYTES = 900_000;

export type SavedBoardChat = {
  sessionId: string | null;
  streamIndex: number;
  events: MessageStreamEvent[];
};

async function requireChatViewer(boardIdInput: string) {
  const user = await requireUser();
  const boardId = boardIdSchema.parse(boardIdInput);
  await requireBoardAccess(boardId, user.id, "view");
  return { boardId, userId: user.id };
}

function ownChat(boardId: string, userId: string) {
  return and(eq(boardChats.boardId, boardId), eq(boardChats.userId, userId));
}

/** The caller's chat on this board, or null if they haven't started one. */
export async function getBoardChat(
  boardIdInput: string,
): Promise<SavedBoardChat | null> {
  const { boardId, userId } = await requireChatViewer(boardIdInput);

  const rows = await db
    .select()
    .from(boardChats)
    .where(ownChat(boardId, userId))
    .limit(1);
  const chat = rows[0];
  if (!chat) return null;

  const events = await db
    .select({ event: boardChatEvents.event })
    .from(boardChatEvents)
    .where(eq(boardChatEvents.chatId, chat.id))
    .orderBy(asc(boardChatEvents.eventIndex));

  return {
    sessionId: chat.sessionId,
    streamIndex: chat.streamIndex,
    events: events.map((row) => row.event),
  };
}

/**
 * Binds a newly created eve session to the caller's chat. A chat keeps its
 * first session, so a second tab racing to create one gets an error instead
 * of silently forking the conversation.
 */
export async function saveBoardChatSession(input: {
  boardId: string;
  sessionId: string;
}): Promise<void> {
  const { boardId, userId } = await requireChatViewer(input.boardId);
  const sessionId = sessionIdSchema.parse(input.sessionId);

  await db
    .insert(boardChats)
    .values({ id: crypto.randomUUID(), boardId, userId, sessionId })
    .onConflictDoUpdate({
      target: [boardChats.boardId, boardChats.userId],
      set: { sessionId, updatedAt: new Date() },
      setWhere: isNull(boardChats.sessionId),
    });

  const rows = await db
    .select({ sessionId: boardChats.sessionId })
    .from(boardChats)
    .where(ownChat(boardId, userId))
    .limit(1);
  if (rows[0]?.sessionId !== sessionId) {
    throw new Error("This chat is already linked to another session");
  }
}

const appendSchema = z.object({
  boardId: boardIdSchema,
  sessionId: sessionIdSchema,
  fromIndex: z.number().int().min(0),
  streamIndex: z.number().int().min(0),
  events: z
    .array(z.looseObject({ type: z.string() }))
    .max(MAX_EVENTS_PER_APPEND),
});

/**
 * Saves events starting at `fromIndex`. Overlapping indexes overwrite the
 * same slots, so retries are safe; a gap past the saved log is rejected.
 */
export async function appendBoardChatEvents(input: {
  boardId: string;
  sessionId: string;
  fromIndex: number;
  streamIndex: number;
  events: readonly MessageStreamEvent[];
}): Promise<void> {
  const { boardId, userId } = await requireChatViewer(input.boardId);
  const parsed = appendSchema.parse(input);
  if (JSON.stringify(parsed.events).length > MAX_APPEND_BYTES) {
    throw new Error("Chat update is too large");
  }
  const events = parsed.events as unknown as MessageStreamEvent[];

  await db.transaction(async (tx) => {
    const rows = await tx
      .select()
      .from(boardChats)
      .where(ownChat(boardId, userId))
      .for("update")
      .limit(1);
    const chat = rows[0];
    if (!chat || chat.sessionId !== parsed.sessionId) {
      throw new Error("Chat session not found");
    }
    if (parsed.fromIndex > chat.eventCount) {
      throw new Error("Chat events are out of order");
    }

    if (events.length > 0) {
      await tx
        .insert(boardChatEvents)
        .values(
          events.map((event, i) => ({
            chatId: chat.id,
            eventIndex: parsed.fromIndex + i,
            event,
          })),
        )
        .onConflictDoUpdate({
          target: [boardChatEvents.chatId, boardChatEvents.eventIndex],
          set: { event: sql`excluded.event` },
        });
    }

    await tx
      .update(boardChats)
      .set({
        eventCount: Math.max(chat.eventCount, parsed.fromIndex + events.length),
        streamIndex: Math.max(chat.streamIndex, parsed.streamIndex),
        updatedAt: new Date(),
      })
      .where(eq(boardChats.id, chat.id));
  });
}
