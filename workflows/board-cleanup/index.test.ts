import { beforeEach, describe, expect, it, vi } from "vitest";

const steps = vi.hoisted(() => ({
  deleteBlobs: vi.fn(),
  deleteBoardPrefix: vi.fn(),
  retireChatSession: vi.fn(),
}));

vi.mock("./steps", () => ({
  stepDeleteBlobs: steps.deleteBlobs,
  stepDeleteBoardPrefix: steps.deleteBoardPrefix,
  stepRetireChatSession: steps.retireChatSession,
}));

import { workflowCleanUpBoard } from "./index";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("workflowCleanUpBoard", () => {
  it("deletes node objects, sweeps the board prefix, and retires each chat", async () => {
    await workflowCleanUpBoard({
      boardId: "board-a",
      objectKeys: ["board-a/user-a/img", "user-b/board-a/legacy.pdf"],
      sessionIds: ["wrun_a", "wrun_b"],
    });

    expect(steps.deleteBlobs).toHaveBeenCalledWith([
      "board-a/user-a/img",
      "user-b/board-a/legacy.pdf",
    ]);
    expect(steps.deleteBoardPrefix).toHaveBeenCalledWith("board-a");
    expect(steps.retireChatSession.mock.calls).toEqual([
      ["wrun_a"],
      ["wrun_b"],
    ]);
  });
});
