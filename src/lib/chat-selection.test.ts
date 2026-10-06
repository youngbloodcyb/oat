import { describe, expect, it } from "vitest";
import type { BoardNode } from "@/lib/store";
import {
  extractSelection,
  selectedItems,
  selectionBlock,
} from "./chat-selection";

function node(overrides: Partial<BoardNode>): BoardNode {
  return {
    id: "node-a",
    type: "text",
    position: { x: 0, y: 0 },
    data: { kind: "text", text: "<p>Hello <b>there</b></p>" },
    ...overrides,
  } as BoardNode;
}

describe("chat selection", () => {
  it("lists only selected nodes, titled for the agent", () => {
    const items = selectedItems([
      node({ selected: true }),
      node({ id: "node-b", selected: false }),
      node({
        id: "node-c",
        type: "link",
        selected: true,
        data: { kind: "link", url: "https://example.com", og: { title: " " } },
      }),
    ]);

    expect(items).toEqual([
      { id: "node-a", type: "text", title: "Hello there" },
      { id: "node-c", type: "link", title: "https://example.com" },
    ]);
  });

  it("round-trips through a separate text part", () => {
    const items = [{ id: "node-a", type: "pdf" as const, title: "Report" }];

    expect(extractSelection(selectionBlock(items))).toEqual({
      text: "",
      items,
    });
  });

  it("splits typed text from a block in the same part", () => {
    const items = [{ id: "node-a", type: "image" as const, title: "Cat" }];

    expect(extractSelection(`What is this?\n${selectionBlock(items)}`)).toEqual(
      { text: "What is this?", items },
    );
  });

  it("leaves text alone when the block isn't valid", () => {
    const text = "Look: <board-selection>not json</board-selection>";
    expect(extractSelection(text)).toEqual({ text, items: [] });
    expect(extractSelection("plain")).toEqual({ text: "plain", items: [] });
  });
});
