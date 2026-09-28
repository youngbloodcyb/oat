import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth-server", () => ({
  requireUser: vi.fn(),
}));

vi.mock("@/lib/blob", () => ({
  deleteBlob: vi.fn().mockResolvedValue(undefined),
  nodeObjectKey: vi.fn((data: { kind: string; objectKey?: string }) =>
    data?.kind === "image" || data?.kind === "pdf"
      ? data?.objectKey
      : undefined,
  ),
}));

vi.mock("@/lib/realtime-redis", () => ({
  publishDurableBoardEvent: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/services/board-access", () => ({
  findBoardAccess: vi.fn(),
}));

vi.mock("@/db", () => ({
  db: {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
}));

import { db as _db } from "@/db";
import { requireUser } from "@/lib/auth-server";
import { deleteBlob } from "@/lib/blob";
import { findBoardAccess } from "@/services/board-access";
import {
  createBoard,
  deleteBoard,
  getBoard,
  listBoards,
  updateBoard,
} from "./boards";

const db = _db as any;
const mockRequireUser = vi.mocked(requireUser);
const mockDeleteBlob = vi.mocked(deleteBlob);
const mockFindBoardAccess = vi.mocked(findBoardAccess);

function chainable(value: unknown) {
  const p = Promise.resolve(value) as any;
  p.from = vi.fn().mockReturnThis();
  p.leftJoin = vi.fn().mockReturnThis();
  p.where = vi.fn().mockReturnThis();
  p.orderBy = vi.fn().mockReturnThis();
  p.limit = vi.fn().mockReturnThis();
  p.values = vi.fn().mockReturnThis();
  p.set = vi.fn().mockReturnThis();
  return p;
}

const USER_A = {
  id: "user-a",
  name: "A",
  email: "a@test.com",
  emailVerified: false,
  image: null,
  createdAt: new Date("2026-01-01"),
  updatedAt: new Date("2026-01-01"),
};
const BOARD_A = {
  id: "board-a",
  userId: USER_A.id,
  name: "Board A",
  createdAt: new Date("2026-01-01"),
};

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireUser.mockResolvedValue(USER_A);
  mockFindBoardAccess.mockResolvedValue({ board: BOARD_A, role: "owner" });
});

describe("listBoards", () => {
  it("requires an authenticated session", async () => {
    mockRequireUser.mockRejectedValue(new Error("Unauthorized"));
    await expect(listBoards()).rejects.toThrow("Unauthorized");
  });

  it("returns the signed-in user's boards newest first", async () => {
    const query = chainable([
      {
        id: BOARD_A.id,
        name: BOARD_A.name,
        createdAt: BOARD_A.createdAt,
        ownerId: BOARD_A.userId,
        sharedRole: null,
      },
    ]);
    db.select.mockReturnValue(query);
    const result = await listBoards();
    expect(result).toEqual([
      {
        id: BOARD_A.id,
        name: BOARD_A.name,
        createdAt: BOARD_A.createdAt,
        accessRole: "owner",
      },
    ]);
    expect(query.where).toHaveBeenCalled();
    expect(query.orderBy).toHaveBeenCalled();
  });

  it("returns an empty array when the user has no boards", async () => {
    db.select.mockReturnValue(chainable([]));
    expect(await listBoards()).toEqual([]);
  });

  it("includes boards shared with the signed-in user and their role", async () => {
    const shared = { ...BOARD_A, id: "board-shared", userId: "owner-b" };
    db.select.mockReturnValue(
      chainable([
        {
          id: shared.id,
          name: shared.name,
          createdAt: shared.createdAt,
          ownerId: shared.userId,
          sharedRole: "viewer",
        },
      ]),
    );

    await expect(listBoards()).resolves.toEqual([
      {
        id: shared.id,
        name: shared.name,
        createdAt: shared.createdAt,
        accessRole: "viewer",
      },
    ]);
  });
});

describe("getBoard", () => {
  it("returns the board when owned by the user", async () => {
    db.select.mockReturnValue(chainable([]));
    const result = await getBoard("board-a");
    expect(result).toEqual({
      id: BOARD_A.id,
      name: BOARD_A.name,
      createdAt: BOARD_A.createdAt,
      accessRole: "owner",
      isShared: false,
    });
    expect(mockFindBoardAccess).toHaveBeenCalledWith("board-a", USER_A.id);
  });

  it("marks an owned board as shared when it has at least one share", async () => {
    db.select.mockReturnValue(chainable([{ userId: "user-b" }]));
    const result = await getBoard("board-a");
    expect(result?.isShared).toBe(true);
  });

  it("marks boards accessed through a share as shared without querying shares", async () => {
    mockFindBoardAccess.mockResolvedValue({
      board: { ...BOARD_A, userId: "owner-b" },
      role: "editor",
    });
    const result = await getBoard("board-a");
    expect(result?.isShared).toBe(true);
    expect(db.select).not.toHaveBeenCalled();
  });

  it("returns null for a board owned by another user (conceals unowned)", async () => {
    mockFindBoardAccess.mockResolvedValue(null);
    expect(await getBoard("board-b")).toBeNull();
  });

  it("returns null for a missing board (same as unowned)", async () => {
    mockFindBoardAccess.mockResolvedValue(null);
    expect(await getBoard("nonexistent")).toBeNull();
  });

  it("requires an authenticated session", async () => {
    mockRequireUser.mockRejectedValue(new Error("Unauthorized"));
    await expect(getBoard("board-a")).rejects.toThrow("Unauthorized");
  });
});

describe("createBoard", () => {
  it("creates a board scoped to the authenticated user and returns an id", async () => {
    const query = chainable(undefined);
    db.insert.mockReturnValue(query);
    const id = await createBoard("My board");
    expect(id).toBeTypeOf("string");
    expect(query.values).toHaveBeenCalledWith(
      expect.objectContaining({ userId: USER_A.id, name: "My board" }),
    );
  });

  it("requires an authenticated session", async () => {
    mockRequireUser.mockRejectedValue(new Error("Unauthorized"));
    await expect(createBoard("test")).rejects.toThrow("Unauthorized");
  });
});

describe("updateBoard", () => {
  function setupUpdate(rowCount: number) {
    const whereChain = chainable({ rowCount });
    const setChain = { where: vi.fn().mockReturnValue(whereChain) };
    db.update.mockReturnValue({ set: vi.fn().mockReturnValue(setChain) });
    return whereChain;
  }

  it("updates an owned board without throwing", async () => {
    setupUpdate(1);
    await expect(
      updateBoard("board-a", { name: "Updated" }),
    ).resolves.toBeUndefined();
  });

  it("throws when the board is not found or not owned", async () => {
    setupUpdate(0);
    await expect(updateBoard("board-b", { name: "Updated" })).rejects.toThrow(
      "Board not found",
    );
  });

  it("requires an authenticated session", async () => {
    mockRequireUser.mockRejectedValue(new Error("Unauthorized"));
    await expect(updateBoard("board-a", { name: "x" })).rejects.toThrow(
      "Unauthorized",
    );
  });
});

describe("deleteBoard", () => {
  it("deletes an owned board and cleans up blob files for image/pdf nodes", async () => {
    db.select.mockReturnValue(
      chainable([
        { data: { kind: "image", objectKey: "user-a/board-a/img1" } },
        { data: { kind: "text", text: "hello" } },
      ]),
    );
    db.delete.mockReturnValue(chainable({ rowCount: 1 }));

    await deleteBoard("board-a");

    expect(mockDeleteBlob).toHaveBeenCalledTimes(1);
    expect(mockDeleteBlob.mock.calls[0][0]).toBe("user-a/board-a/img1");
  });

  it("throws when the board is not found or not owned (no blob cleanup)", async () => {
    db.select.mockReturnValue(chainable([]));
    db.delete.mockReturnValue(chainable({ rowCount: 0 }));

    await expect(deleteBoard("board-b")).rejects.toThrow("Board not found");
    expect(mockDeleteBlob).not.toHaveBeenCalled();
  });

  it("skips blob cleanup for nodes without object keys", async () => {
    db.select.mockReturnValue(
      chainable([
        { data: { kind: "link", url: "https://example.com" } },
        { data: { kind: "text", text: "hi" } },
      ]),
    );
    db.delete.mockReturnValue(chainable({ rowCount: 1 }));

    await deleteBoard("board-a");
    expect(mockDeleteBlob).not.toHaveBeenCalled();
  });

  it("requires an authenticated session", async () => {
    mockRequireUser.mockRejectedValue(new Error("Unauthorized"));
    await expect(deleteBoard("board-a")).rejects.toThrow("Unauthorized");
  });
});
