import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  select: vi.fn(),
  requireBoardAccess: vi.fn(),
  requireNodeAccess: vi.fn(),
  runSearch: vi.fn(),
  embedSearchQuery: vi.fn(),
  insertNode: vi.fn(),
  deleteNode: vi.fn(),
  queryCommentThreads: vi.fn(),
}));

vi.mock("@/db", () => ({ db: { select: mocks.select } }));
vi.mock("@/services/board-access", () => ({
  requireBoardAccess: mocks.requireBoardAccess,
  requireNodeAccess: mocks.requireNodeAccess,
}));
vi.mock("@/services/comment-reads", () => ({
  queryCommentThreads: mocks.queryCommentThreads,
}));
vi.mock("@/lib/search-query", () => ({ runSearch: mocks.runSearch }));
vi.mock("@/lib/embedding", () => ({
  embedSearchQuery: mocks.embedSearchQuery,
}));
vi.mock("@/services/node-writes", () => ({
  insertNode: mocks.insertNode,
  deleteNode: mocks.deleteNode,
}));

import type { ToolContext } from "eve/tools";
import type { StoredNode } from "@/db/schema";
import { textToHtml } from "@/lib/board-changes";
import { linkSuggestionsSchema } from "@/lib/link-suggestions";
import addToBoard from "../tools/add_to_board";
import getNode from "../tools/get_node";
import listBoardNodes from "../tools/list_board_nodes";
import listComments from "../tools/list_comments";
import removeFromBoard from "../tools/remove_from_board";
import searchBoard from "../tools/search_board";
import suggestLinks from "../tools/suggest_links";

type Executable = {
  execute: (input: never, ctx: ToolContext) => Promise<unknown>;
};

function run(tool: unknown, input: unknown, ctx: ToolContext) {
  return (tool as Executable).execute(input as never, ctx);
}

function contextFor(
  current: { principalId: string; principalType: string } | null,
): ToolContext {
  return { session: { auth: { current } } } as unknown as ToolContext;
}

const userCtx = contextFor({ principalId: "user-a", principalType: "user" });

function chainable(value: unknown) {
  const promise = Promise.resolve(value) as Promise<unknown> &
    Record<string, ReturnType<typeof vi.fn>>;
  for (const method of ["from", "where", "orderBy", "limit"]) {
    promise[method] = vi.fn().mockReturnValue(promise);
  }
  return promise;
}

function storedNode(overrides: Partial<StoredNode>): StoredNode {
  return {
    id: "node-a",
    boardId: "board-a",
    userId: "owner-a",
    type: "text",
    positionX: 0,
    positionY: 0,
    width: null,
    height: null,
    zIndex: null,
    data: { kind: "text", text: "<p>Hello</p>" },
    searchText: "Hello",
    embeddingSource: null,
    createdAt: new Date("2026-01-01"),
    updatedAt: new Date("2026-01-01"),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireBoardAccess.mockResolvedValue({
    board: { id: "board-a", name: "Board A" },
    role: "viewer",
  });
  mocks.embedSearchQuery.mockResolvedValue([0.1, 0.2]);
  mocks.runSearch.mockResolvedValue([]);
});

describe.each([
  ["list_board_nodes", listBoardNodes, { boardId: "board-a" }],
  ["search_board", searchBoard, { boardId: "board-a", query: "plans" }],
  ["get_node", getNode, { nodeId: "node-a" }],
  ["list_comments", listComments, { boardId: "board-a" }],
])("%s", (_name, tool, input) => {
  it("requires a signed-in user", async () => {
    await expect(run(tool, input, contextFor(null))).rejects.toThrow(
      "signed-in",
    );
    await expect(
      run(
        tool,
        input,
        contextFor({ principalId: "local-dev", principalType: "runtime" }),
      ),
    ).rejects.toThrow("signed-in");
    expect(mocks.requireBoardAccess).not.toHaveBeenCalled();
    expect(mocks.requireNodeAccess).not.toHaveBeenCalled();
  });

  it("stops when the caller can't view the board", async () => {
    mocks.requireBoardAccess.mockRejectedValue(new Error("Board not found"));
    mocks.requireNodeAccess.mockRejectedValue(new Error("Board not found"));

    await expect(run(tool, input, userCtx)).rejects.toThrow("Board not found");
    expect(mocks.select).not.toHaveBeenCalled();
    expect(mocks.runSearch).not.toHaveBeenCalled();
    expect(mocks.queryCommentThreads).not.toHaveBeenCalled();
  });
});

describe("list_board_nodes", () => {
  it("checks access for the caller, not a model-supplied user", async () => {
    mocks.select.mockReturnValue(chainable([storedNode({})]));

    const result = (await run(
      listBoardNodes,
      { boardId: "board-a" },
      userCtx,
    )) as {
      nodes: { id: string; title: string; excerpt: string }[];
    };

    expect(mocks.requireBoardAccess).toHaveBeenCalledWith(
      "board-a",
      "user-a",
      "view",
    );
    expect(result.nodes).toEqual([
      expect.objectContaining({
        id: "node-a",
        title: "Hello",
        excerpt: "Hello",
      }),
    ]);
  });
});

describe("search_board", () => {
  it("searches only within the board for the caller", async () => {
    await run(searchBoard, { boardId: "board-a", query: "plans" }, userCtx);

    expect(mocks.runSearch).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-a",
        query: "plans",
        scope: { boardId: "board-a", mode: "only" },
      }),
    );
  });
});

describe("list_comments", () => {
  it("returns threads with the item each is pinned to", async () => {
    const author = { id: "user-b", name: "Bea", image: null };
    mocks.queryCommentThreads.mockResolvedValue([
      {
        id: "thread-a",
        boardId: "board-a",
        position: { x: 10, y: 10 },
        createdAt: "2026-01-01T00:00:00.000Z",
        author,
        comments: [
          {
            id: "comment-a",
            threadId: "thread-a",
            body: "Is this current?",
            createdAt: "2026-01-01T00:00:00.000Z",
            author,
          },
        ],
      },
      {
        id: "thread-b",
        boardId: "board-a",
        position: { x: 5_000, y: 5_000 },
        createdAt: "2026-01-02T00:00:00.000Z",
        author,
        comments: [],
      },
    ]);
    mocks.select.mockReturnValue(chainable([storedNode({})]));

    const result = (await run(
      listComments,
      { boardId: "board-a" },
      userCtx,
    )) as {
      threads: { id: string; pinnedTo: unknown; comments: unknown[] }[];
    };

    expect(mocks.requireBoardAccess).toHaveBeenCalledWith(
      "board-a",
      "user-a",
      "view",
    );
    expect(mocks.queryCommentThreads).toHaveBeenCalledWith("board-a");
    expect(result.threads[0]).toEqual({
      id: "thread-a",
      position: { x: 10, y: 10 },
      pinnedTo: { id: "node-a", type: "text", title: "Hello" },
      comments: [
        {
          author: "Bea",
          createdAt: "2026-01-01T00:00:00.000Z",
          body: "Is this current?",
        },
      ],
    });
    expect(result.threads[1].pinnedTo).toBeNull();
  });
});

describe("get_node", () => {
  it("pages long PDF text", async () => {
    const markdown = "a".repeat(25_000);
    mocks.requireNodeAccess.mockResolvedValue({
      node: storedNode({
        type: "pdf",
        data: { kind: "pdf", name: "Report.pdf", markdown },
      }),
    });

    const first = (await run(getNode, { nodeId: "node-a" }, userCtx)) as {
      text: string;
      nextOffset: number | null;
      totalChars: number;
    };
    expect(mocks.requireNodeAccess).toHaveBeenCalledWith(
      "node-a",
      "user-a",
      "view",
    );
    expect(first.text).toHaveLength(20_000);
    expect(first.totalChars).toBe(25_000);
    expect(first.nextOffset).toBe(20_000);

    const second = (await run(
      getNode,
      { nodeId: "node-a", offset: 20_000 },
      userCtx,
    )) as { text: string; nextOffset: number | null };
    expect(second.text).toHaveLength(5_000);
    expect(second.nextOffset).toBeNull();
  });
});

describe("suggest_links", () => {
  it("returns the links for the chat to render", async () => {
    const links = [
      {
        url: "https://shop.example.com/products/mug",
        title: "Stoneware mug",
        price: "$25.00",
      },
    ];
    await expect(
      Promise.resolve(run(suggestLinks, { links }, userCtx)),
    ).resolves.toEqual({
      shown: 1,
      links,
    });
  });

  it("only accepts http(s) links", () => {
    const parse = (url: string) =>
      linkSuggestionsSchema.safeParse({ links: [{ url, title: "Item" }] })
        .success;
    expect(parse("https://example.com/item")).toBe(true);
    expect(parse("javascript:alert(1)")).toBe(false);
    expect(parse("ftp://example.com/item")).toBe(false);
  });
});

describe("add_to_board", () => {
  type Policy = (ctx: unknown) => Promise<unknown>;
  const approve = (addToBoard as unknown as { approval: Policy }).approval;
  const approvalCtx = (input: unknown) => ({
    session: userCtx.session,
    toolInput: input,
  });

  it("asks the person before adding to a board they can edit", async () => {
    mocks.requireBoardAccess.mockResolvedValue({ board: { id: "board-a" } });
    await expect(approve(approvalCtx({ boardId: "board-a" }))).resolves.toBe(
      "user-approval",
    );
    expect(mocks.requireBoardAccess).toHaveBeenCalledWith(
      "board-a",
      "user-a",
      "edit",
    );
  });

  it("turns viewers away without an approval card", async () => {
    mocks.requireBoardAccess.mockRejectedValue(new Error("Forbidden"));
    await expect(
      approve(approvalCtx({ boardId: "board-a" })),
    ).resolves.toMatchObject({ type: "denied" });
  });

  it("adds links and notes to the right of the existing nodes", async () => {
    mocks.requireBoardAccess.mockResolvedValue({ board: { id: "board-a" } });
    mocks.select.mockReturnValue(
      chainable([
        { type: "text", x: 0, y: 50, width: 200, height: 100, zIndex: 3 },
      ]),
    );
    mocks.insertNode.mockImplementation(async (input) => ({
      id: `node-${input.type}`,
      ...input,
    }));

    await run(
      addToBoard,
      {
        boardId: "board-a",
        items: [
          { type: "link", url: "https://shop.example.com/mug" },
          { type: "link", url: "https://example.com/guide.pdf" },
          { type: "text", text: "Pick <one>\n\nby Friday" },
        ],
      },
      userCtx,
    );

    const calls = mocks.insertNode.mock.calls.map(([input]) => input);
    expect(calls.map((c) => c.type)).toEqual(["link", "pdf", "text"]);
    expect(calls[0]).toMatchObject({
      userId: "user-a",
      boardId: "board-a",
      zIndex: 4,
      position: { x: 280, y: 50 },
    });
    expect(calls[2].data.text).toBe("<p>Pick &lt;one&gt;</p><p>by Friday</p>");
  });
});

describe("textToHtml", () => {
  it("keeps single line breaks inside a paragraph", () => {
    expect(textToHtml("a\nb")).toBe("<p>a<br>b</p>");
  });
});

describe("remove_from_board", () => {
  type Policy = (ctx: unknown) => Promise<unknown>;
  const approve = (removeFromBoard as unknown as { approval: Policy }).approval;
  const approvalCtx = (input: unknown) => ({
    session: userCtx.session,
    toolInput: input,
  });
  const onBoard = (id: string, boardId = "board-a") => ({
    node: storedNode({
      id,
      boardId,
      type: "link",
      data: { kind: "link", url: `https://example.com/${id}` },
    }),
  });

  it("asks the person before deleting items on this board", async () => {
    mocks.requireBoardAccess.mockResolvedValue({ board: { id: "board-a" } });
    mocks.requireNodeAccess.mockImplementation(async (id) => onBoard(id));
    await expect(
      approve(approvalCtx({ boardId: "board-a", nodeIds: ["n1", "n2"] })),
    ).resolves.toBe("user-approval");
  });

  it("refuses ids from another board before showing a card", async () => {
    mocks.requireBoardAccess.mockResolvedValue({ board: { id: "board-a" } });
    mocks.requireNodeAccess.mockImplementation(async (id) =>
      onBoard(id, "board-b"),
    );
    await expect(
      approve(approvalCtx({ boardId: "board-a", nodeIds: ["n1"] })),
    ).resolves.toMatchObject({ type: "denied" });
  });

  it("deletes each item and skips ones already gone", async () => {
    mocks.requireBoardAccess.mockResolvedValue({ board: { id: "board-a" } });
    mocks.requireNodeAccess.mockImplementation(async (id) => {
      if (id === "gone") throw new Error("Node not found");
      return onBoard(id);
    });

    const result = await run(
      removeFromBoard,
      { boardId: "board-a", nodeIds: ["n1", "gone"] },
      userCtx,
    );

    expect(mocks.deleteNode).toHaveBeenCalledTimes(1);
    expect(mocks.deleteNode).toHaveBeenCalledWith({
      userId: "user-a",
      nodeId: "n1",
    });
    expect(result).toEqual({
      removed: [{ id: "n1", type: "link", title: "https://example.com/n1" }],
      missing: ["gone"],
    });
  });
});
