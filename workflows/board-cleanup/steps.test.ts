import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  del: vi.fn(),
  list: vi.fn(),
  reset: vi.fn(),
  attach: vi.fn(),
}));

vi.mock("@vercel/blob", () => ({ del: mocks.del, list: mocks.list }));
vi.mock("@/lib/eve-server-client", () => ({
  eveServerClient: () => ({ sessions: { attach: mocks.attach } }),
}));

import {
  stepDeleteBlobs,
  stepDeleteBoardPrefix,
  stepRetireChatSession,
} from "./steps";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.del.mockResolvedValue(undefined);
  mocks.attach.mockReturnValue({ reset: mocks.reset });
  mocks.reset.mockResolvedValue({ status: "reset" });
});

describe("stepDeleteBlobs", () => {
  it("deletes in batches of 100", async () => {
    const keys = Array.from({ length: 250 }, (_, i) => `board-a/u/${i}`);

    await stepDeleteBlobs(keys);

    expect(mocks.del.mock.calls.map(([batch]) => batch.length)).toEqual([
      100, 100, 50,
    ]);
  });

  it("skips the call when there is nothing to delete", async () => {
    await stepDeleteBlobs([]);
    expect(mocks.del).not.toHaveBeenCalled();
  });

  it("lets failures throw so the step is retried", async () => {
    mocks.del.mockRejectedValue(new Error("blob down"));
    await expect(stepDeleteBlobs(["board-a/u/1"])).rejects.toThrow("blob down");
  });
});

describe("stepDeleteBoardPrefix", () => {
  it("pages through everything under the board prefix", async () => {
    mocks.list
      .mockResolvedValueOnce({
        blobs: [{ pathname: "board-a/u/1" }, { pathname: "board-a/u/2" }],
        hasMore: true,
        cursor: "next",
      })
      .mockResolvedValueOnce({
        blobs: [{ pathname: "board-a/u/3" }],
        hasMore: false,
      });

    await expect(stepDeleteBoardPrefix("board-a")).resolves.toBe(3);

    expect(mocks.list.mock.calls).toEqual([
      [{ prefix: "board-a/", cursor: undefined, limit: 100 }],
      [{ prefix: "board-a/", cursor: "next", limit: 100 }],
    ]);
    expect(mocks.del.mock.calls).toEqual([
      [["board-a/u/1", "board-a/u/2"]],
      [["board-a/u/3"]],
    ]);
  });
});

describe("stepRetireChatSession", () => {
  it("resets the eve session", async () => {
    await stepRetireChatSession("wrun_a");

    expect(mocks.attach).toHaveBeenCalledWith("wrun_a");
    expect(mocks.reset).toHaveBeenCalledWith({ reason: "board deleted" });
  });
});
