import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  select: vi.fn(),
  requireBoardAccess: vi.fn(),
  requireNodeAccess: vi.fn(),
  runSearch: vi.fn(),
  embedSearchQuery: vi.fn(),
  insertNode: vi.fn(),
}));

vi.mock("@/db", () => ({ db: { select: mocks.select } }));
vi.mock("@/services/board-access", () => ({
  requireBoardAccess: mocks.requireBoardAccess,
  requireNodeAccess: mocks.requireNodeAccess,
}));
vi.mock("@/lib/search-query", () => ({ runSearch: mocks.runSearch }));
vi.mock("@/lib/embedding", () => ({
  embedSearchQuery: mocks.embedSearchQuery,
}));
vi.mock("@/services/node-writes", () => ({ insertNode: mocks.insertNode }));

import type { ToolContext } from "eve/tools";
import type { StoredNode } from "@/db/schema";
import { textToHtml } from "@/lib/board-additions";
import { linkSuggestionsSchema } from "@/lib/link-suggestions";
import addToBoard from "../tools/add_to_board";
import getNode from "../tools/get_node";
import listBoardNodes from "../tools/list_board_nodes";
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
