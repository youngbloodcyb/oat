import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth-server", () => ({
  requireUser: vi.fn(),
}));

vi.mock("@/lib/blob", () => ({
  blobExists: vi.fn().mockResolvedValue(true),
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
  requireBoardAccess: vi.fn(),
  requireNodeAccess: vi.fn(),
}));

vi.mock("@/db", () => ({
  db: {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock("workflow/api", () => ({
  start: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@workflows/embed", () => ({
  workflowEmbedNode: vi.fn(),
}));

import { workflowEmbedNode } from "@workflows/embed";
import { start } from "workflow/api";
import { db as _db } from "@/db";
import type { NodeData, StoredNode } from "@/db/schema";
import { requireUser } from "@/lib/auth-server";
import { blobExists, deleteBlob } from "@/lib/blob";
import { publishDurableBoardEvent } from "@/lib/realtime-redis";
import { requireBoardAccess, requireNodeAccess } from "@/services/board-access";
import {
  createNode,
  duplicateNode,
  listNodesByBoard,
  patchImageNode,
  removeNode,
  updateNode,
} from "./nodes";

const db = _db as any;
const mockRequireUser = vi.mocked(requireUser);
const mockBlobExists = vi.mocked(blobExists);
const mockDeleteBlob = vi.mocked(deleteBlob);
const mockPublishDurableBoardEvent = vi.mocked(publishDurableBoardEvent);
const mockStart = vi.mocked(start);
const mockWorkflowEmbedNode = vi.mocked(workflowEmbedNode);
const mockRequireBoardAccess = vi.mocked(requireBoardAccess);
const mockRequireNodeAccess = vi.mocked(requireNodeAccess);

function chainable(value: unknown) {
  const p = Promise.resolve(value) as any;
  p.from = vi.fn().mockReturnThis();
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

function storedNode(overrides: Partial<StoredNode> = {}): StoredNode {
  return {
    id: "node-1",
    boardId: BOARD_A.id,
    userId: USER_A.id,
    type: "link",
    positionX: 0,
    positionY: 0,
    width: null,
    height: null,
    zIndex: null,
    data: { kind: "link", url: "https://example.com" } as NodeData,
    createdAt: new Date("2026-01-01"),
    updatedAt: new Date("2026-01-01"),
    ...overrides,
  } as StoredNode;
}

beforeEach(() => {
  vi.clearAllMocks();
  db.select.mockReset();
  db.insert.mockReset();
  db.update.mockReset();
  db.delete.mockReset();
  mockRequireUser.mockResolvedValue(USER_A as any);
  mockBlobExists.mockResolvedValue(true);
  mockRequireBoardAccess.mockResolvedValue({
    board: BOARD_A,
    role: "owner",
  });
  mockRequireNodeAccess.mockImplementation(async (nodeId) => ({
    node: storedNode({ id: nodeId }),
    access: { board: BOARD_A, role: "owner" },
  }));
});

describe("listNodesByBoard", () => {
  it("requires an authenticated session", async () => {
    mockRequireUser.mockRejectedValue(new Error("Unauthorized"));
    await expect(listNodesByBoard("board-a")).rejects.toThrow("Unauthorized");
  });

  it("returns nodes scoped to the board and the authenticated user", async () => {
    const query = chainable([
      storedNode({ id: "n1" }),
      storedNode({ id: "n2" }),
    ]);
    db.select.mockReturnValue(query);
    const result = await listNodesByBoard("board-a");
    expect(result).toHaveLength(2);
    expect(query.where).toHaveBeenCalled();
  });

  it("returns an empty array when the board has no nodes", async () => {
    db.select.mockReturnValue(chainable([]));
    expect(await listNodesByBoard("board-a")).toEqual([]);
  });

  it("maps stored image nodes to client DTOs with a /api/files src", async () => {
    db.select.mockReturnValue(
      chainable([
        storedNode({
          id: "img-1",
          type: "image",
          data: { kind: "image", objectKey: "user-a/board-a/img1", alt: "hi" },
        }),
      ]),
    );
    const [node] = await listNodesByBoard("board-a");
    expect(node.data).toEqual({
      kind: "image",
      src: "/api/files/img-1",
      alt: "hi",
      fit: undefined,
    });
  });

  it("maps stored pdf nodes to client DTOs with a /api/files src", async () => {
    db.select.mockReturnValue(
      chainable([
        storedNode({
          id: "pdf-1",
          type: "pdf",
          data: {
            kind: "pdf",
            objectKey: "user-a/board-a/doc.pdf",
            name: "doc",
            markdown: "# Private document contents",
          },
        }),
      ]),
    );
    const [node] = await listNodesByBoard("board-a");
    expect(node.data).toEqual({
      kind: "pdf",
      src: "/api/files/pdf-1",
      name: "doc",
    });
  });

  it("passes link and text data through unchanged", async () => {
    db.select.mockReturnValue(
      chainable([
        storedNode({
          id: "link-1",
          type: "link",
          data: { kind: "link", url: "https://x.com" },
        }),
        storedNode({
          id: "text-1",
          type: "text",
          data: { kind: "text", text: "hello" },
        }),
      ]),
    );
    const [link, text] = await listNodesByBoard("board-a");
    expect(link.data).toEqual({ kind: "link", url: "https://x.com" });
    expect(text.data).toEqual({ kind: "text", text: "hello" });
  });
});

describe("createNode", () => {
  function setupBoardLookup(board: unknown) {
    if (board) {
      mockRequireBoardAccess.mockResolvedValue({
        board: board as typeof BOARD_A,
        role: "owner",
      });
    } else {
      mockRequireBoardAccess.mockRejectedValue(new Error("Board not found"));
    }
  }

  function setupInsert() {
    const query = chainable(undefined);
    db.insert.mockReturnValue(query);
    return query;
  }

  it("requires an authenticated session", async () => {
    mockRequireUser.mockRejectedValue(new Error("Unauthorized"));
    await expect(
      createNode({
        boardId: "board-a",
        type: "link",
        position: { x: 0, y: 0 },
        data: { kind: "link", url: "https://x.com" },
      }),
    ).rejects.toThrow("Unauthorized");
  });

  it("throws when the board is not owned by the user", async () => {
    setupBoardLookup(null);
    await expect(
      createNode({
        boardId: "board-b",
        type: "link",
        position: { x: 0, y: 0 },
        data: { kind: "link", url: "https://x.com" },
      }),
    ).rejects.toThrow("Board not found");
  });

  it("creates a link node scoped to the user and board", async () => {
    setupBoardLookup(BOARD_A);
    const query = setupInsert();
    const id = await createNode({
      boardId: "board-a",
      type: "link",
      position: { x: 10, y: 20 },
      data: { kind: "link", url: "https://x.com" },
      style: { width: 200, height: 100 },
    });
    expect(id).toBeTypeOf("string");
    expect(query.values).toHaveBeenCalledWith(
      expect.objectContaining({
        boardId: "board-a",
        userId: USER_A.id,
        type: "link",
        positionX: 10,
        positionY: 20,
        width: 200,
        height: 100,
        data: { kind: "link", url: "https://x.com" },
        searchText: "https://x.com",
      }),
    );
    expect(mockStart).toHaveBeenCalledWith(mockWorkflowEmbedNode, [id]);
    expect(mockPublishDurableBoardEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "node.created",
        boardId: "board-a",
        actorUserId: USER_A.id,
        node: expect.objectContaining({ id, type: "link" }),
      }),
    );
  });

  it("creates a text node", async () => {
    setupBoardLookup(BOARD_A);
    const query = setupInsert();
    await createNode({
      boardId: "board-a",
      type: "text",
      position: { x: 0, y: 0 },
      data: { kind: "text", text: "hello" },
    });
    expect(query.values).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "text",
        data: { kind: "text", text: "hello" },
      }),
    );
  });

  it("stores the board owner on nodes created by an editor", async () => {
    mockRequireUser.mockResolvedValue({ ...USER_A, id: "editor-a" } as any);
    mockRequireBoardAccess.mockResolvedValue({
      board: BOARD_A,
      role: "editor",
    });
    const query = setupInsert();

    await createNode({
      boardId: BOARD_A.id,
      type: "text",
      position: { x: 0, y: 0 },
      data: { kind: "text", text: "from editor" },
    });

    expect(query.values).toHaveBeenCalledWith(
      expect.objectContaining({ userId: BOARD_A.userId }),
    );
    expect(mockRequireBoardAccess).toHaveBeenCalledWith(
      BOARD_A.id,
      "editor-a",
      "edit",
    );
  });

  it("creates an image node after verifying the blob exists", async () => {
    setupBoardLookup(BOARD_A);
    const query = setupInsert();
    await createNode({
      boardId: "board-a",
      type: "image",
      position: { x: 0, y: 0 },
      data: { kind: "image", objectKey: "user-a/board-a/img1", alt: "pic" },
    });
    expect(mockBlobExists).toHaveBeenCalledWith("user-a/board-a/img1");
    expect(query.values).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "image",
        data: { kind: "image", objectKey: "user-a/board-a/img1", alt: "pic" },
        embeddingSource: expect.stringMatching(/^[a-f0-9]{64}$/),
      }),
    );
    expect(mockStart).toHaveBeenCalledOnce();
  });

  it("embeds an image even when it has no alt text", async () => {
    setupBoardLookup(BOARD_A);
    const query = setupInsert();

    const id = await createNode({
      boardId: "board-a",
      type: "image",
      position: { x: 0, y: 0 },
      data: { kind: "image", objectKey: "user-a/board-a/unlabeled" },
    });

    expect(query.values).toHaveBeenCalledWith(
      expect.objectContaining({
        searchText: "",
        embeddingSource: expect.stringMatching(/^[a-f0-9]{64}$/),
      }),
    );
    expect(mockStart).toHaveBeenCalledWith(mockWorkflowEmbedNode, [id]);
  });

  it("creates a pdf node after verifying the blob exists", async () => {
    setupBoardLookup(BOARD_A);
    const query = setupInsert();
    await createNode({
      boardId: "board-a",
      type: "pdf",
      position: { x: 0, y: 0 },
      data: { kind: "pdf", objectKey: "user-a/board-a/doc.pdf", name: "doc" },
    });
    expect(mockBlobExists).toHaveBeenCalledWith("user-a/board-a/doc.pdf");
    expect(query.values).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "pdf",
        data: { kind: "pdf", objectKey: "user-a/board-a/doc.pdf", name: "doc" },
      }),
    );
  });

  it("throws 'Upload not found' when the image blob does not exist", async () => {
    setupBoardLookup(BOARD_A);
    mockBlobExists.mockResolvedValue(false);
    await expect(
      createNode({
        boardId: "board-a",
        type: "image",
        position: { x: 0, y: 0 },
        data: {
          kind: "image",
          objectKey: "user-a/board-a/missing",
          alt: "pic",
        },
      }),
    ).rejects.toThrow("Upload not found");
  });

  it("skips blob existence check for link and text nodes", async () => {
    setupBoardLookup(BOARD_A);
    setupInsert();
    await createNode({
      boardId: "board-a",
      type: "link",
      position: { x: 0, y: 0 },
      data: { kind: "link", url: "https://x.com" },
    });
    expect(mockBlobExists).not.toHaveBeenCalled();
  });
});

describe("updateNode", () => {
  function setupUpdate(rowCount: number) {
    const whereChain = chainable({ rowCount });
    const setChain = { where: vi.fn().mockReturnValue(whereChain) };
    db.update.mockReturnValue({ set: vi.fn().mockReturnValue(setChain) });
    return whereChain;
  }

  it("requires an authenticated session", async () => {
    mockRequireUser.mockRejectedValue(new Error("Unauthorized"));
    await expect(
      updateNode({ nodeId: "n1", position: { x: 1, y: 2 } }),
    ).rejects.toThrow("Unauthorized");
  });

  it("updates position without overwriting other fields", async () => {
    const whereChain = setupUpdate(1);
    await updateNode({ nodeId: "n1", position: { x: 10, y: 20 } });
    expect(whereChain).toBeDefined();
    const setCall = (db.update as any).mock.results[0].value.set.mock
      .calls[0][0];
    expect(setCall.positionX).toBe(10);
    expect(setCall.positionY).toBe(20);
    expect(setCall.data).toBeUndefined();
    expect(setCall.width).toBeUndefined();
    expect(setCall.zIndex).toBeUndefined();
  });

  it("updates data only", async () => {
    setupUpdate(1);
    await updateNode({ nodeId: "n1", data: { kind: "text", text: "new" } });
    const setCall = (db.update as any).mock.results[0].value.set.mock
      .calls[0][0];
    expect(setCall.data).toEqual({ kind: "text", text: "new" });
    expect(setCall.searchText).toBe("new");
    expect(setCall.positionX).toBeUndefined();
    expect(mockStart).toHaveBeenCalledWith(mockWorkflowEmbedNode, ["n1"]);
  });

  it("updates style (dimensions) only", async () => {
    setupUpdate(1);
    await updateNode({ nodeId: "n1", style: { width: 300, height: 150 } });
    const setCall = (db.update as any).mock.results[0].value.set.mock
      .calls[0][0];
    expect(setCall.width).toBe(300);
    expect(setCall.height).toBe(150);
    expect(setCall.data).toBeUndefined();
  });

  it("updates zIndex only (reorder)", async () => {
    setupUpdate(1);
    await updateNode({ nodeId: "n1", zIndex: 5 });
    const setCall = (db.update as any).mock.results[0].value.set.mock
      .calls[0][0];
    expect(setCall.zIndex).toBe(5);
    expect(setCall.positionX).toBeUndefined();
    expect(setCall.data).toBeUndefined();
  });

  it("throws 'Node not found' when the node is not owned (rowCount 0)", async () => {
    setupUpdate(0);
    await expect(
      updateNode({ nodeId: "n-other", position: { x: 1, y: 1 } }),
    ).rejects.toThrow("Node not found");
  });
});

describe("patchImageNode", () => {
  function setupNodeLookup(node: StoredNode | null) {
    if (node) {
      mockRequireNodeAccess.mockResolvedValue({
        node,
        access: { board: BOARD_A, role: "owner" },
      });
    } else {
      mockRequireNodeAccess.mockRejectedValue(new Error("Node not found"));
    }
  }

  function setupUpdate(rowCount: number) {
    const whereChain = chainable({ rowCount });
    const setChain = { where: vi.fn().mockReturnValue(whereChain) };
    db.update.mockReturnValue({ set: vi.fn().mockReturnValue(setChain) });
    return whereChain;
  }

  it("requires an authenticated session", async () => {
    mockRequireUser.mockRejectedValue(new Error("Unauthorized"));
    await expect(
      patchImageNode({ nodeId: "img-1", fit: "cover" }),
    ).rejects.toThrow("Unauthorized");
  });

  it("throws 'Node not found' when the node is not owned", async () => {
    setupNodeLookup(null);
    await expect(
      patchImageNode({ nodeId: "img-x", fit: "cover" }),
    ).rejects.toThrow("Node not found");
  });

  it("is a no-op when the node is not an image", async () => {
    setupNodeLookup(
      storedNode({
        id: "text-1",
        type: "text",
        data: { kind: "text", text: "hi" },
      }),
    );
    setupUpdate(1);
    await patchImageNode({ nodeId: "text-1", fit: "cover" });
    expect(db.update).not.toHaveBeenCalled();
  });

  it("updates image fit without changing the objectKey", async () => {
    setupNodeLookup(
      storedNode({
        id: "img-1",
        type: "image",
        data: { kind: "image", objectKey: "user-a/board-a/img1", alt: "a" },
      }),
    );
    setupUpdate(1);
    await patchImageNode({ nodeId: "img-1", fit: "contain" });
    const setCall = (db.update as any).mock.results[0].value.set.mock
      .calls[0][0];
    expect(setCall.data.fit).toBe("contain");
    expect(setCall.data.objectKey).toBe("user-a/board-a/img1");
    expect(mockDeleteBlob).not.toHaveBeenCalled();
    expect(mockStart).not.toHaveBeenCalled();
  });

  it("replaces the backing object and deletes the old blob", async () => {
    setupNodeLookup(
      storedNode({
        id: "img-1",
        type: "image",
        data: { kind: "image", objectKey: "user-a/board-a/old", alt: "a" },
      }),
    );
    setupUpdate(1);
    await patchImageNode({ nodeId: "img-1", objectKey: "user-a/board-a/new" });
    const setCall = (db.update as any).mock.results[0].value.set.mock
      .calls[0][0];
    expect(setCall.data.objectKey).toBe("user-a/board-a/new");
    expect(setCall.data.url).toBeUndefined();
    expect(mockDeleteBlob).toHaveBeenCalledWith("user-a/board-a/old");
    expect(mockStart).toHaveBeenCalledWith(mockWorkflowEmbedNode, ["img-1"]);
  });

  it("does not delete a blob when there was no previous objectKey", async () => {
    setupNodeLookup(
      storedNode({
        id: "img-1",
        type: "image",
        data: { kind: "image", url: "https://ext.com/img.png" },
      }),
    );
    setupUpdate(1);
    await patchImageNode({ nodeId: "img-1", objectKey: "user-a/board-a/new" });
    expect(mockDeleteBlob).not.toHaveBeenCalled();
  });

  it("throws 'Node not found' when the update affects 0 rows", async () => {
    setupNodeLookup(
      storedNode({
        id: "img-1",
        type: "image",
        data: { kind: "image", objectKey: "user-a/board-a/old" },
      }),
    );
    setupUpdate(0);
    await expect(
      patchImageNode({ nodeId: "img-1", fit: "cover" }),
    ).rejects.toThrow("Node not found");
    expect(mockDeleteBlob).not.toHaveBeenCalled();
  });
});

describe("removeNode", () => {
  function setupNodeLookup(node: StoredNode | null) {
    if (node) {
      mockRequireNodeAccess.mockResolvedValue({
        node,
        access: { board: BOARD_A, role: "owner" },
      });
    } else {
      mockRequireNodeAccess.mockRejectedValue(new Error("Node not found"));
    }
  }

  function setupDelete(rowCount: number) {
    const whereChain = chainable({ rowCount });
    db.delete.mockReturnValue(whereChain);
    return whereChain;
  }

  it("requires an authenticated session", async () => {
    mockRequireUser.mockRejectedValue(new Error("Unauthorized"));
    await expect(removeNode("n1")).rejects.toThrow("Unauthorized");
  });

  it("throws 'Node not found' when the node is not owned", async () => {
    setupNodeLookup(null);
    await expect(removeNode("n-x")).rejects.toThrow("Node not found");
  });

  it("deletes an image node and cleans up its blob", async () => {
    setupNodeLookup(
      storedNode({
        id: "img-1",
        type: "image",
        data: { kind: "image", objectKey: "user-a/board-a/img1" },
      }),
    );
    setupDelete(1);
    await removeNode("img-1");
    expect(mockDeleteBlob).toHaveBeenCalledWith("user-a/board-a/img1");
  });

  it("deletes a pdf node and cleans up its blob", async () => {
    setupNodeLookup(
      storedNode({
        id: "pdf-1",
        type: "pdf",
        data: { kind: "pdf", objectKey: "user-a/board-a/doc.pdf", name: "d" },
      }),
    );
    setupDelete(1);
    await removeNode("pdf-1");
    expect(mockDeleteBlob).toHaveBeenCalledWith("user-a/board-a/doc.pdf");
  });

  it("deletes a link node without blob cleanup", async () => {
    setupNodeLookup(
      storedNode({
        id: "link-1",
        type: "link",
        data: { kind: "link", url: "https://x.com" },
      }),
    );
    setupDelete(1);
    await removeNode("link-1");
    expect(mockDeleteBlob).not.toHaveBeenCalled();
  });

  it("deletes a text node without blob cleanup", async () => {
    setupNodeLookup(
      storedNode({
        id: "text-1",
        type: "text",
        data: { kind: "text", text: "hi" },
      }),
    );
    setupDelete(1);
    await removeNode("text-1");
    expect(mockDeleteBlob).not.toHaveBeenCalled();
  });

  it("throws 'Node not found' when the delete affects 0 rows", async () => {
    setupNodeLookup(
      storedNode({
        id: "n1",
        type: "link",
        data: { kind: "link", url: "https://x.com" },
      }),
    );
    setupDelete(0);
    await expect(removeNode("n1")).rejects.toThrow("Node not found");
  });
});

describe("duplicateNode", () => {
  function setupLookups(srcNode: StoredNode | null, board: unknown) {
    if (srcNode) {
      mockRequireNodeAccess.mockResolvedValue({
        node: srcNode,
        access: { board: BOARD_A, role: "owner" },
      });
    } else {
      mockRequireNodeAccess.mockRejectedValue(new Error("Node not found"));
    }
    if (board) {
      mockRequireBoardAccess.mockResolvedValue({
        board: board as typeof BOARD_A,
        role: "owner",
      });
    } else {
      mockRequireBoardAccess.mockRejectedValue(new Error("Board not found"));
    }
  }

  function setupInsert() {
    const query = chainable(undefined);
    db.insert.mockReturnValue(query);
    return query;
  }

  it("requires an authenticated session", async () => {
    mockRequireUser.mockRejectedValue(new Error("Unauthorized"));
    await expect(
      duplicateNode({
        nodeId: "n1",
        boardId: "board-a",
        position: { x: 0, y: 0 },
      }),
    ).rejects.toThrow("Unauthorized");
  });

  it("throws 'Node not found' when the source node is not owned", async () => {
    setupLookups(null, BOARD_A);
    await expect(
      duplicateNode({
        nodeId: "n-x",
        boardId: "board-a",
        position: { x: 0, y: 0 },
      }),
    ).rejects.toThrow("Node not found");
  });

  it("throws 'Board not found' when the target board is not owned", async () => {
    setupLookups(
      storedNode({
        id: "n1",
        type: "link",
        data: { kind: "link", url: "https://x.com" },
      }),
      null,
    );
    await expect(
      duplicateNode({
        nodeId: "n1",
        boardId: "board-x",
        position: { x: 0, y: 0 },
      }),
    ).rejects.toThrow("Board not found");
  });

  it("duplicates a node with the new position and copies the source data", async () => {
    const src = storedNode({
      id: "n1",
      type: "text",
      data: { kind: "text", text: "hello" },
      zIndex: 3,
    });
    setupLookups(src, BOARD_A);
    const query = setupInsert();
    const result = await duplicateNode({
      nodeId: "n1",
      boardId: "board-a",
      position: { x: 24, y: 24 },
      style: { width: 200, height: 100 },
    });
    expect(result).toBeTypeOf("string");
    expect(query.values).toHaveBeenCalledWith(
      expect.objectContaining({
        boardId: "board-a",
        userId: USER_A.id,
        type: "text",
        positionX: 24,
        positionY: 24,
        width: 200,
        height: 100,
        zIndex: 3,
        data: { kind: "text", text: "hello" },
        searchText: "hello",
      }),
    );
    expect(mockRequireNodeAccess).toHaveBeenCalledWith("n1", USER_A.id, "edit");
    expect(mockStart).toHaveBeenCalledWith(mockWorkflowEmbedNode, [result]);
  });

  it("preserves private PDF markdown in the duplicated stored data", async () => {
    const data = {
      kind: "pdf" as const,
      objectKey: "user-a/board-a/report.pdf",
      name: "report.pdf",
      markdown: "# Quarterly report",
    };
    setupLookups(storedNode({ id: "pdf-1", type: "pdf", data }), BOARD_A);
    const query = setupInsert();

    await duplicateNode({
      nodeId: "pdf-1",
      boardId: "board-a",
      position: { x: 24, y: 24 },
    });

    expect(query.values).toHaveBeenCalledWith(
      expect.objectContaining({ data }),
    );
  });

  it("falls back to source dimensions when no style is provided", async () => {
    const src = storedNode({
      id: "n1",
      type: "image",
      data: { kind: "image", objectKey: "user-a/board-a/img1" },
      width: 400,
      height: 300,
    });
    setupLookups(src, BOARD_A);
    const query = setupInsert();
    await duplicateNode({
      nodeId: "n1",
      boardId: "board-a",
      position: { x: 0, y: 0 },
    });
    expect(query.values).toHaveBeenCalledWith(
      expect.objectContaining({ width: 400, height: 300 }),
    );
  });

  it("does not persist transient React Flow state (no selected/dragging fields)", async () => {
    setupLookups(
      storedNode({
        id: "n1",
        type: "link",
        data: { kind: "link", url: "https://x.com" },
      }),
      BOARD_A,
    );
    const query = setupInsert();
    await duplicateNode({
      nodeId: "n1",
      boardId: "board-a",
      position: { x: 0, y: 0 },
    });
    const values = query.values.mock.calls[0][0];
    expect(values).not.toHaveProperty("selected");
    expect(values).not.toHaveProperty("dragging");
    expect(values).not.toHaveProperty("measured");
  });
});
