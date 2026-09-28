import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth-server", () => ({
  requireUser: vi.fn(),
}));

vi.mock("@/services/board-access", () => ({
  requireBoardAccess: vi.fn(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/realtime-redis", () => ({
  publishAccessEvent: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/db", () => ({
  db: {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
}));

import { db as database } from "@/db";
import type { Board, User } from "@/db/schema";
import { requireUser } from "@/lib/auth-server";
import { publishAccessEvent } from "@/lib/realtime-redis";
import { requireBoardAccess } from "@/services/board-access";
import {
  addBoardShare,
  listBoardShares,
  removeBoardShare,
  updateBoardShare,
} from "./shares";

const db = database as unknown as Record<string, ReturnType<typeof vi.fn>>;
const mockRequireUser = vi.mocked(requireUser);
const mockRequireBoardAccess = vi.mocked(requireBoardAccess);
const mockPublishAccessEvent = vi.mocked(publishAccessEvent);

function chainable(value: unknown) {
  const promise = Promise.resolve(value) as Promise<unknown> &
    Record<string, ReturnType<typeof vi.fn>>;
  for (const method of [
    "from",
    "innerJoin",
    "where",
    "orderBy",
    "limit",
    "values",
    "set",
    "onConflictDoUpdate",
  ]) {
    promise[method] = vi.fn().mockReturnValue(promise);
  }
  return promise;
}

const owner: User = {
  id: "owner-a",
  name: "Owner",
  email: "owner@example.com",
  emailVerified: true,
  image: null,
  createdAt: new Date("2026-01-01"),
  updatedAt: new Date("2026-01-01"),
};

const board: Board = {
  id: "board-a",
  userId: owner.id,
  name: "Board A",
  createdAt: new Date("2026-01-01"),
};

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireUser.mockResolvedValue(owner);
  mockRequireBoardAccess.mockResolvedValue({ board, role: "owner" });
});

describe("board shares", () => {
  it("lists only after verifying owner access", async () => {
    const members = [
      {
        userId: "viewer-a",
        name: "Viewer",
        email: "viewer@example.com",
        image: null,
        role: "viewer",
      },
    ];
    db.select.mockReturnValue(chainable(members));

    await expect(listBoardShares(board.id)).resolves.toEqual(members);
    expect(mockRequireBoardAccess).toHaveBeenCalledWith(
      board.id,
      owner.id,
      "owner",
    );
  });

  it("adds or updates an existing account by normalized email", async () => {
    db.select.mockReturnValue(chainable([{ id: "editor-a" }]));
    const insert = chainable(undefined);
    db.insert.mockReturnValue(insert);

    await addBoardShare({
      boardId: board.id,
      email: "  Editor@Example.com ",
      role: "editor",
    });

    expect(insert.values).toHaveBeenCalledWith({
      boardId: board.id,
      userId: "editor-a",
      role: "editor",
    });
    expect(insert.onConflictDoUpdate).toHaveBeenCalled();
    expect(mockPublishAccessEvent).toHaveBeenCalledWith({
      type: "access.changed",
      boardId: board.id,
      userId: "editor-a",
      role: "editor",
    });
  });

  it("rejects email addresses without an account", async () => {
    db.select.mockReturnValue(chainable([]));
    await expect(
      addBoardShare({
        boardId: board.id,
        email: "missing@example.com",
        role: "viewer",
      }),
    ).rejects.toThrow("No account found");
  });

  it("does not create a share row for the owner", async () => {
    db.select.mockReturnValue(chainable([{ id: owner.id }]));
    await expect(
      addBoardShare({
        boardId: board.id,
        email: owner.email,
        role: "editor",
      }),
    ).rejects.toThrow("owner already has access");
    expect(db.insert).not.toHaveBeenCalled();
  });

  it("updates and removes an existing member", async () => {
    const update = chainable({ rowCount: 1 });
    const remove = chainable({ rowCount: 1 });
    db.update.mockReturnValue(update);
    db.delete.mockReturnValue(remove);

    await updateBoardShare({
      boardId: board.id,
      userId: "member-a",
      role: "viewer",
    });
    await removeBoardShare({ boardId: board.id, userId: "member-a" });

    expect(update.where).toHaveBeenCalled();
    expect(remove.where).toHaveBeenCalled();
    expect(mockPublishAccessEvent).toHaveBeenNthCalledWith(1, {
      type: "access.changed",
      boardId: board.id,
      userId: "member-a",
      role: "viewer",
    });
    expect(mockPublishAccessEvent).toHaveBeenNthCalledWith(2, {
      type: "access.changed",
      boardId: board.id,
      userId: "member-a",
      role: null,
    });
  });

  it("prevents non-owners from managing shares", async () => {
    mockRequireBoardAccess.mockRejectedValue(new Error("Forbidden"));
    await expect(listBoardShares(board.id)).rejects.toThrow("Forbidden");
    expect(db.select).not.toHaveBeenCalled();
  });
});
