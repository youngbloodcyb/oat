import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/services/comments", () => ({
  createCommentThread: vi.fn(),
  listCommentThreads: vi.fn(),
  replyToCommentThread: vi.fn(),
  resolveCommentThread: vi.fn(),
}));

import type { BoardCommentThread, CommentAuthor } from "@/lib/comments";
import {
  createCommentThread,
  replyToCommentThread,
  resolveCommentThread,
} from "@/services/comments";
import {
  postCommentReply,
  postCommentThread,
  resolveThread,
  useCommentStore,
} from "./comment-store";

const mockCreate = vi.mocked(createCommentThread);
const mockReply = vi.mocked(replyToCommentThread);
const mockResolve = vi.mocked(resolveCommentThread);

const author: CommentAuthor = { id: "user-a", name: "Ada", image: null };

const saved: BoardCommentThread = {
  id: "thread-a",
  boardId: "board-a",
  position: { x: 0, y: 0 },
  createdAt: "2026-01-01T00:00:00.000Z",
  author,
  comments: [
    {
      id: "comment-a",
      threadId: "thread-a",
      body: "First",
      createdAt: "2026-01-01T00:00:00.000Z",
      author,
    },
  ],
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const state = () => useCommentStore.getState();

beforeEach(() => {
  vi.clearAllMocks();
  useCommentStore.setState({ boardId: null });
  state().setThreads("board-a", [saved]);
});

describe("optimistic comments", () => {
  it("shows a new thread before the server saves it", async () => {
    const save = deferred<BoardCommentThread>();
    mockCreate.mockReturnValue(save.promise);

    const posting = postCommentThread({
      boardId: "board-a",
      position: { x: 5, y: 6 },
      body: "New",
      author,
    });

    const thread = state().threads.at(-1);
    expect(thread?.comments[0].body).toBe("New");
    expect(state().openThreadId).toBe(thread?.id);
    expect(state().pendingIds.has(thread?.comments[0].id ?? "")).toBe(true);
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        threadId: thread?.id,
        commentId: thread?.comments[0].id,
      }),
    );

    save.resolve(saved);
    await posting;
    expect(state().pendingIds.size).toBe(0);
    expect(state().threads).toHaveLength(2);
  });

  it("removes a new thread when saving fails", async () => {
    mockCreate.mockRejectedValue(new Error("nope"));

    await expect(
      postCommentThread({
        boardId: "board-a",
        position: { x: 5, y: 6 },
        body: "New",
        author,
      }),
    ).rejects.toThrow("nope");

    expect(state().threads).toEqual([saved]);
    expect(state().openThreadId).toBeNull();
    expect(state().pendingIds.size).toBe(0);
  });

  it("shows a reply right away and rolls it back on failure", async () => {
    const save = deferred<never>();
    mockReply.mockReturnValue(save.promise);

    const posting = postCommentReply({ thread: saved, body: "Reply", author });
    await Promise.resolve();
    expect(state().threads[0].comments.map((c) => c.body)).toEqual([
      "First",
      "Reply",
    ]);

    save.reject(new Error("nope"));
    await expect(posting).rejects.toThrow("nope");
    expect(state().threads[0].comments.map((c) => c.body)).toEqual(["First"]);
  });

  it("waits for a new thread to save before replying to it", async () => {
    const save = deferred<BoardCommentThread>();
    mockCreate.mockReturnValue(save.promise);
    mockReply.mockResolvedValue(saved.comments[0]);

    const posting = postCommentThread({
      boardId: "board-a",
      position: { x: 0, y: 0 },
      body: "New",
      author,
    });
    const thread = state().threads.at(-1) as BoardCommentThread;
    const replying = postCommentReply({ thread, body: "Reply", author });

    await Promise.resolve();
    expect(mockReply).not.toHaveBeenCalled();
    expect(state().threads.at(-1)?.comments).toHaveLength(2);

    save.resolve(saved);
    await Promise.all([posting, replying]);
    expect(mockReply).toHaveBeenCalledWith(
      expect.objectContaining({ threadId: thread.id }),
    );
  });

  it("hides a resolved thread right away and restores it on failure", async () => {
    const save = deferred<never>();
    mockResolve.mockReturnValue(save.promise);

    const resolving = resolveThread(saved);
    expect(state().threads).toEqual([]);

    save.reject(new Error("nope"));
    await expect(resolving).rejects.toThrow("nope");
    expect(state().threads).toEqual([saved]);
  });

  it("keeps unsaved comments when the server list is reloaded", () => {
    state().addComment(
      saved,
      { ...saved.comments[0], id: "comment-b", body: "Unsaved" },
      { pending: true },
    );

    state().setThreads("board-a", [saved]);

    expect(state().threads[0].comments.map((c) => c.body)).toEqual([
      "First",
      "Unsaved",
    ]);
  });
});
