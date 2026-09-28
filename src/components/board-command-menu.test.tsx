import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

const mocks = vi.hoisted(() => ({
  searchNodesByBoard: vi.fn(),
}));

vi.mock("@/services/search", () => ({
  searchNodesByBoard: mocks.searchNodesByBoard,
}));

import { BoardCommandMenu } from "@/components/board-command-menu";
import type { NodeSearchResult } from "@/services/search";

const result: NodeSearchResult = {
  nodeId: "node-1",
  boardId: "board-a",
  boardName: "Product",
  type: "text",
  title: "Q4 roadmap",
  excerpt: "Launch milestones and owner notes",
  position: { x: 10, y: 20 },
  score: 0.02,
  matchedBy: { keyword: false, semantic: true },
};

const otherResult: NodeSearchResult = {
  ...result,
  nodeId: "node-2",
  boardId: "board-b",
  boardName: "Research",
  title: "Anthropic revenue",
};

beforeAll(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class ResizeObserverMock {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
    configurable: true,
    value: vi.fn(),
  });
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.searchNodesByBoard.mockResolvedValue({
    currentBoard: [result],
    otherBoards: [],
  });
});

afterEach(cleanup);

function renderMenu(
  overrides: Partial<Parameters<typeof BoardCommandMenu>[0]> = {},
) {
  return render(
    <BoardCommandMenu
      boardId="board-a"
      open
      onOpenChange={vi.fn()}
      onSelectNode={vi.fn()}
      {...overrides}
    />,
  );
}

function search(value: string) {
  const input = screen.getByPlaceholderText(
    "Search nodes or type a command...",
  );
  fireEvent.change(input, { target: { value } });
  return input;
}

describe("BoardCommandMenu", () => {
  it("keeps semantic results visible and selects them from the keyboard", async () => {
    const onOpenChange = vi.fn();
    const onSelectNode = vi.fn();
    renderMenu({ onOpenChange, onSelectNode });

    const input = search("strategy");

    await waitFor(() => {
      expect(mocks.searchNodesByBoard).toHaveBeenCalledWith({
        query: "strategy",
        boardId: "board-a",
        limit: 10,
      });
      expect(screen.getByText("Q4 roadmap")).toBeTruthy();
    });

    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onSelectNode).toHaveBeenCalledWith(result);
  });

  it("lists this board's results before results from other boards, labelled with their board", async () => {
    mocks.searchNodesByBoard.mockResolvedValue({
      currentBoard: [result],
      otherBoards: [otherResult],
    });
    renderMenu();
    search("anthropic");

    await waitFor(() => screen.getByText("Anthropic revenue"));

    const headings = screen
      .getAllByText(/On this board|In other boards/)
      .map((el) => el.textContent);
    expect(headings).toEqual(["On this board", "In other boards"]);

    const current = screen.getByText("Q4 roadmap");
    const other = screen.getByText("Anthropic revenue");
    expect(
      current.compareDocumentPosition(other) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(screen.getByTitle("Opens Research").textContent).toContain(
      "Research",
    );
    expect(screen.queryByTitle("Opens Product")).toBeNull();
  });

  it("says when nothing on this board matches but other boards do", async () => {
    mocks.searchNodesByBoard.mockResolvedValue({
      currentBoard: [],
      otherBoards: [otherResult],
    });
    renderMenu();
    search("anthropic");

    await waitFor(() => screen.getByText("Anthropic revenue"));
    expect(screen.getByText("No matches on this board.")).toBeTruthy();
  });

  it("opens from the standard command-menu shortcut", () => {
    const onOpenChange = vi.fn();
    renderMenu({ open: false, onOpenChange });

    fireEvent.keyDown(document, { key: "k", metaKey: true });

    expect(onOpenChange).toHaveBeenCalledWith(true);
  });
});
