import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth-server", () => ({
  requireUser: vi.fn(),
}));

vi.mock("@/services/board-access", () => ({
  requireBoardAccess: vi.fn(),
}));

vi.mock("@/db", () => ({
  db: {
    select: vi.fn(),
    insert: vi.fn(),
    delete: vi.fn(),
    transaction: vi.fn(),
  },
}));

import type { MessageStreamEvent } from "eve/client";
import { db as database } from "@/db";
import type { Board, BoardChat, User } from "@/db/schema";
import { requireUser } from "@/lib/auth-server";
import { requireBoardAccess } from "@/services/board-access";
import {
  appendBoardChatEvents,
  clearBoardChat,
  getBoardChat,
  saveBoardChatSession,
} from "./board-chats";

const db = database as unknown as Record<string, ReturnType<typeof vi.fn>>;
const mockRequireUser = vi.mocked(requireUser);
const mockRequireBoardAccess = vi.mocked(requireBoardAccess);

function chainable(value: unknown) {
  const promise = Promise.resolve(value) as Promise<unknown> &
    Record<string, ReturnType<typeof vi.fn>>;
  for (const method of [
    "from",
    "where",
    "orderBy",
    "limit",
    "for",
    "values",
    "set",
    "onConflictDoUpdate",
    "returning",
  ]) {
    promise[method] = vi.fn().mockReturnValue(promise);
  }
  return promise;
}

const viewer: User = {
  id: "viewer-a",
  name: "Viewer",
  email: "viewer@example.com",
  emailVerified: true,
  image: null,
  createdAt: new Date("2026-01-01"),
  updatedAt: new Date("2026-01-01"),
};

const board: Board = {
  id: "board-a",
  userId: "owner-a",
  name: "Board A",
  createdAt: new Date("2026-01-01"),
};

const chat: BoardChat = {
  id: "chat-a",
  boardId: board.id,
  userId: viewer.id,
  sessionId: "wrun_a",
  streamIndex: 2,
  eventCount: 2,
  createdAt: new Date("2026-01-01"),
  updatedAt: new Date("2026-01-01"),
};

const event = (n: number) =>
  ({ type: "message.appended", data: { n } }) as unknown as MessageStreamEvent;

/** Runs the transaction callback against a fresh mock `tx`. */
function mockTransaction(lockedChat: BoardChat | undefined) {
  const tx = {
    select: vi.fn().mockReturnValue(chainable(lockedChat ? [lockedChat] : [])),
    insert: vi.fn().mockReturnValue(chainable(undefined)),
    update: vi.fn().mockReturnValue(chainable(undefined)),
  };
  db.transaction.mockImplementation((fn: (t: typeof tx) => unknown) => fn(tx));
  return tx;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireUser.mockResolvedValue(viewer);
  mockRequireBoardAccess.mockResolvedValue({ board, role: "viewer" });
});

describe("getBoardChat", () => {
  it("requires view access to the board", async () => {
    mockRequireBoardAccess.mockRejectedValue(new Error("Board not found"));

    await expect(getBoardChat(board.id)).rejects.toThrow("Board not found");
    expect(mockRequireBoardAccess).toHaveBeenCalledWith(
      board.id,
      viewer.id,
      "view",
    );
    expect(db.select).not.toHaveBeenCalled();
  });

  it("returns null when the caller has no chat", async () => {
    db.select.mockReturnValue(chainable([]));
    await expect(getBoardChat(board.id)).resolves.toBeNull();
  });

  it("returns the session cursor and ordered events", async () => {
    db.select
      .mockReturnValueOnce(chainable([chat]))
      .mockReturnValueOnce(
        chainable([{ event: event(0) }, { event: event(1) }]),
      );

    await expect(getBoardChat(board.id)).resolves.toEqual({
      sessionId: "wrun_a",
      streamIndex: 2,
      events: [event(0), event(1)],
    });
  });
});

describe("saveBoardChatSession", () => {
  it("binds the session to the caller's chat", async () => {
    const insert = chainable(undefined);
    db.insert.mockReturnValue(insert);
    db.select.mockReturnValue(chainable([{ sessionId: "wrun_a" }]));

    await saveBoardChatSession({ boardId: board.id, sessionId: "wrun_a" });

    expect(insert.values).toHaveBeenCalledWith(
      expect.objectContaining({
        boardId: board.id,
        userId: viewer.id,
        sessionId: "wrun_a",
      }),
    );
  });

  it("refuses to replace a chat's existing session", async () => {
    db.insert.mockReturnValue(chainable(undefined));
    db.select.mockReturnValue(chainable([{ sessionId: "wrun_other" }]));

    await expect(
      saveBoardChatSession({ boardId: board.id, sessionId: "wrun_a" }),
    ).rejects.toThrow("already linked");
  });
});

describe("appendBoardChatEvents", () => {
  it("writes events at their indexes and advances the counters", async () => {
    const tx = mockTransaction(chat);

    await appendBoardChatEvents({
      boardId: board.id,
      sessionId: "wrun_a",
      fromIndex: 2,
      streamIndex: 4,
      events: [event(2), event(3)],
    });

    const insert = tx.insert.mock.results[0].value;
    expect(insert.values).toHaveBeenCalledWith([
      { chatId: chat.id, eventIndex: 2, event: event(2) },
      { chatId: chat.id, eventIndex: 3, event: event(3) },
    ]);
    const update = tx.update.mock.results[0].value;
    expect(update.set).toHaveBeenCalledWith(
      expect.objectContaining({ eventCount: 4, streamIndex: 4 }),
    );
  });

  it("allows overlapping retries without shrinking the counters", async () => {
    const tx = mockTransaction(chat);

    await appendBoardChatEvents({
      boardId: board.id,
      sessionId: "wrun_a",
      fromIndex: 1,
      streamIndex: 0,
      events: [event(1)],
    });

    const update = tx.update.mock.results[0].value;
    expect(update.set).toHaveBeenCalledWith(
      expect.objectContaining({ eventCount: 2, streamIndex: 2 }),
    );
  });

  it("rejects a batch that would leave a gap", async () => {
    const tx = mockTransaction(chat);

    await expect(
      appendBoardChatEvents({
        boardId: board.id,
        sessionId: "wrun_a",
        fromIndex: 5,
        streamIndex: 6,
        events: [event(5)],
      }),
    ).rejects.toThrow("out of order");
    expect(tx.insert).not.toHaveBeenCalled();
  });

  it("rejects events for a different session", async () => {
    const tx = mockTransaction(chat);

    await expect(
      appendBoardChatEvents({
        boardId: board.id,
        sessionId: "wrun_other",
        fromIndex: 2,
        streamIndex: 3,
        events: [event(2)],
      }),
    ).rejects.toThrow("not found");
    expect(tx.insert).not.toHaveBeenCalled();
  });

  it("rejects oversized batches before touching the database", async () => {
    const big = {
      type: "action.result",
      data: { output: "x".repeat(1_000_000) },
    } as unknown as MessageStreamEvent;

    await expect(
      appendBoardChatEvents({
        boardId: board.id,
        sessionId: "wrun_a",
        fromIndex: 2,
        streamIndex: 3,
        events: [big],
      }),
    ).rejects.toThrow("too large");
    expect(db.transaction).not.toHaveBeenCalled();
  });
});

describe("clearBoardChat", () => {
  it("deletes the caller's chat and returns its session", async () => {
    db.delete.mockReturnValue(chainable([{ sessionId: "wrun_a" }]));
    await expect(clearBoardChat(board.id)).resolves.toBe("wrun_a");
  });

  it("returns null when there was nothing to clear", async () => {
    db.delete.mockReturnValue(chainable([]));
    await expect(clearBoardChat(board.id)).resolves.toBeNull();
  });
});
