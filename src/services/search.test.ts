import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  execute: vi.fn(),
  requireUser: vi.fn(),
  embedSearchQuery: vi.fn(),
}));

vi.mock("@/lib/auth-server", () => ({
  requireUser: mocks.requireUser,
}));

vi.mock("@/lib/embedding", () => ({
  embedSearchQuery: mocks.embedSearchQuery,
}));

vi.mock("@/db", () => ({
  db: {
    execute: mocks.execute,
  },
}));

import { PgDialect } from "drizzle-orm/pg-core";
import { searchNodes, searchNodesByBoard } from "./search";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireUser.mockResolvedValue({ id: "user-a" });
  mocks.embedSearchQuery.mockResolvedValue([0.1, 0.2, 0.3]);
  mocks.execute.mockResolvedValue({ rows: [] });
});

describe("searchNodes", () => {
  it("requires authentication", async () => {
    mocks.requireUser.mockRejectedValue(new Error("Unauthorized"));

    await expect(searchNodes({ query: "quarterly report" })).rejects.toThrow(
      "Unauthorized",
    );
    expect(mocks.embedSearchQuery).not.toHaveBeenCalled();
  });

  it("returns no results for an empty query without embedding it", async () => {
    await expect(searchNodes({ query: "   " })).resolves.toEqual([]);
    expect(mocks.embedSearchQuery).not.toHaveBeenCalled();
    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it("scopes both retrieval branches and the final result to accessible boards", async () => {
    await searchNodes({
      query: "quarterly report",
      boardId: "board-a",
      limit: 10,
    });

    const statement = mocks.execute.mock.calls[0][0];
    const compiled = new PgDialect().sqlToQuery(statement);
    expect(compiled.sql).toContain("WITH accessible_boards AS");
    expect(compiled.sql).toContain("FROM board_shares bs");
    expect(compiled.sql).toContain("accessible.id = e.board_id");
    expect(compiled.sql).toContain("accessible.id = n.board_id");
    expect(compiled.sql).toContain("e.board_id =");
    expect(compiled.sql).toContain("n.board_id =");
    expect(compiled.params).toContain("user-a");
    expect(compiled.params).toContain("board-a");
    expect(compiled.params.filter((value) => value === "board-a")).toHaveLength(
      3,
    );
    expect(compiled.sql).toContain(
      "indexed_node.embedding_source = e.source_key",
    );
  });

  it("maps ranked database rows to the public search result", async () => {
    mocks.execute.mockResolvedValue({
      rows: [
        {
          nodeId: "node-1",
          boardId: "board-1",
          boardName: "Research",
          type: "pdf",
          data: {
            kind: "pdf",
            name: "roadmap.pdf",
            markdown: "Secret backing content",
            objectKey: "private/object",
          },
          excerpt: "roadmap.pdf Product direction",
          positionX: 12,
          positionY: 34,
          score: "0.0315",
          keywordMatch: true,
          semanticMatch: true,
        },
      ],
    });

    await expect(searchNodes({ query: "product plan" })).resolves.toEqual([
      {
        nodeId: "node-1",
        boardId: "board-1",
        boardName: "Research",
        type: "pdf",
        title: "roadmap.pdf",
        excerpt: "roadmap.pdf Product direction",
        position: { x: 12, y: 34 },
        score: 0.0315,
        matchedBy: { keyword: true, semantic: true },
      },
    ]);
  });

  it("rejects oversized queries and result limits", async () => {
    await expect(searchNodes({ query: "x".repeat(501) })).rejects.toThrow(
      "Invalid search query",
    );
    await expect(searchNodes({ query: "hello", limit: 51 })).rejects.toThrow(
      "Invalid search query",
    );
    expect(mocks.embedSearchQuery).not.toHaveBeenCalled();
  });
});

describe("searchNodesByBoard", () => {
  it("embeds once and ranks the current board separately from the others", async () => {
    await searchNodesByBoard({ query: "anthropic", boardId: "board-a" });

    expect(mocks.embedSearchQuery).toHaveBeenCalledTimes(1);
    expect(mocks.execute).toHaveBeenCalledTimes(2);
    const [only, exclude] = mocks.execute.mock.calls.map(
      ([statement]) => new PgDialect().sqlToQuery(statement).sql,
    );
    expect(only).toContain("e.board_id =");
    expect(only).not.toContain("<>");
    expect(exclude).toContain("e.board_id <>");
    expect(exclude).toContain("n.board_id <>");
    expect(exclude).toContain("WITH accessible_boards AS");
  });

  it("splits rows into current-board and other-board results", async () => {
    const row = (nodeId: string, boardId: string) => ({
      nodeId,
      boardId,
      boardName: boardId,
      type: "text",
      data: { kind: "text", text: nodeId },
      excerpt: nodeId,
      positionX: 0,
      positionY: 0,
      score: 0.01,
      keywordMatch: true,
      semanticMatch: false,
    });
    mocks.execute
      .mockResolvedValueOnce({ rows: [row("here", "board-a")] })
      .mockResolvedValueOnce({ rows: [row("there", "board-b")] });

    const results = await searchNodesByBoard({
      query: "anthropic",
      boardId: "board-a",
    });

    expect(results.currentBoard.map((r) => r.nodeId)).toEqual(["here"]);
    expect(results.otherBoards.map((r) => r.nodeId)).toEqual(["there"]);
  });

  it("returns empty groups for a blank query without embedding it", async () => {
    await expect(
      searchNodesByBoard({ query: "  ", boardId: "board-a" }),
    ).resolves.toEqual({ currentBoard: [], otherBoards: [] });
    expect(mocks.embedSearchQuery).not.toHaveBeenCalled();
  });
});
