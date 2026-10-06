import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth-server", () => ({
  requireUser: vi.fn(),
}));

vi.mock("@/services/board-access", () => ({
  requireBoardAccess: vi.fn(),
}));

vi.mock("@/lib/realtime-redis", () => ({
  publishCommentEvent: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/db", () => ({
  db: {
    select: vi.fn(),
    insert: vi.fn(),
    delete: vi.fn(),
    transaction: vi.fn(),
  },
}));

import { db as database } from "@/db";
import type { Board, CommentThread, User } from "@/db/schema";
import { requireUser } from "@/lib/auth-server";
import { publishCommentEvent } from "@/lib/realtime-redis";
import { requireBoardAccess } from "@/services/board-access";
import {
  createCommentThread,
  replyToCommentThread,
  resolveCommentThread,
} from "./comments";

const db = database as unknown as Record<string, ReturnType<typeof vi.fn>>;
const mockRequireUser = vi.mocked(requireUser);
const mockRequireBoardAccess = vi.mocked(requireBoardAccess);
const mockPublishCommentEvent = vi.mocked(publishCommentEvent);

function chainable(value: unknown) {
  const promise = Promise.resolve(value) as Promise<unknown> &
    Record<string, ReturnType<typeof vi.fn>>;
  for (const method of ["from", "innerJoin", "where", "orderBy", "limit"]) {
    promise[method] = vi.fn().mockReturnValue(promise);
  }
  promise.values = vi.fn().mockResolvedValue(undefined);
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

const thread: CommentThread = {
  id: "thread-a",
  boardId: board.id,
  userId: "owner-a",
  positionX: 10,
  positionY: 20,
  createdAt: new Date("2026-01-02"),
};

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireUser.mockResolvedValue(viewer);
  mockRequireBoardAccess.mockResolvedValue({ board, role: "viewer" });
});

describe("comments", () => {
  it("lets viewers start a thread and broadcasts it", async () => {
    const insert = chainable(undefined);
    db.transaction.mockImplementation(async (fn) =>
      fn({ insert: () => insert }),
    );

    const created = await createCommentThread({
      boardId: board.id,
      position: { x: 1, y: 2 },
      body: "  Looks good  ",
    });

    expect(mockRequireBoardAccess).toHaveBeenCalledWith(
      board.id,
      viewer.id,
      "view",
    );
    expect(created.position).toEqual({ x: 1, y: 2 });
    expect(created.comments).toHaveLength(1);
    expect(created.comments[0].body).toBe("Looks good");
    expect(mockPublishCommentEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "comment.added",
        boardId: board.id,
        comment: created.comments[0],
      }),
    );
  });

  it("rejects empty comments", async () => {
    await expect(
      createCommentThread({
        boardId: board.id,
        position: { x: 0, y: 0 },
        body: "   ",
      }),
    ).rejects.toThrow();
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it("broadcasts replies with the thread's original author", async () => {
    db.select
      .mockReturnValueOnce(chainable([thread]))
      .mockReturnValueOnce(
        chainable([{ id: "owner-a", name: "Owner", image: null }]),
      );
    db.insert.mockReturnValue(chainable(undefined));

    const reply = await replyToCommentThread({
      threadId: thread.id,
      body: "Agreed",
    });

    expect(reply.author.id).toBe(viewer.id);
    expect(mockPublishCommentEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "comment.added",
        thread: expect.objectContaining({
          id: thread.id,
          author: { id: "owner-a", name: "Owner", image: null },
        }),
        comment: reply,
      }),
    );
  });

  it("keeps viewers from resolving someone else's thread", async () => {
    db.select.mockReturnValue(chainable([thread]));

    await expect(resolveCommentThread({ threadId: thread.id })).rejects.toThrow(
      "Forbidden",
    );
    expect(db.delete).not.toHaveBeenCalled();
    expect(mockPublishCommentEvent).not.toHaveBeenCalled();
  });

  it("lets editors resolve any thread", async () => {
    mockRequireBoardAccess.mockResolvedValue({ board, role: "editor" });
    db.select.mockReturnValue(chainable([thread]));
    db.delete.mockReturnValue(chainable(undefined));

    await resolveCommentThread({ threadId: thread.id });

    expect(db.delete).toHaveBeenCalled();
    expect(mockPublishCommentEvent).toHaveBeenCalledWith({
      type: "comment.resolved",
      boardId: board.id,
      threadId: thread.id,
    });
  });
});
