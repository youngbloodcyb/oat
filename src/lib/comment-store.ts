import { create } from "zustand";
import type {
  BoardComment,
  BoardCommentThread,
  BoardCommentThreadMeta,
  CommentAuthor,
} from "@/lib/comments";
import {
  createCommentThread,
  listCommentThreads,
  replyToCommentThread,
  resolveCommentThread,
} from "@/services/comments";

type Position = { x: number; y: number };

type CommentState = {
  boardId: string | null;
  threads: BoardCommentThread[];
  // Threads resolved this session, so a late "added" event can't revive them.
  resolvedIds: Set<string>;
  /** Comments shown optimistically that the server hasn't saved yet. */
  pendingIds: Set<string>;
  /** True while the dock's comment tool is armed: the next click pins one. */
  placing: boolean;
  /** Where a new, not-yet-posted comment will be pinned (flow coordinates). */
  draft: Position | null;
  openThreadId: string | null;

  setThreads: (boardId: string, threads: BoardCommentThread[]) => void;
  addComment: (
    thread: BoardCommentThreadMeta,
    comment: BoardComment,
    options?: { pending?: boolean },
  ) => void;
  confirmComment: (commentId: string) => void;
  /** Rolls back an optimistic comment, and its thread if it was the first. */
  removeComment: (threadId: string, commentId: string) => void;
  removeThread: (threadId: string) => void;
  /** Rolls back an optimistic resolve. */
  restoreThread: (thread: BoardCommentThread) => void;
  setPlacing: (placing: boolean) => void;
  startDraft: (position: Position) => void;
  openThread: (threadId: string | null) => void;
  /** Closes any draft or open thread. */
  dismiss: () => void;
};

const byCreatedAt = (a: BoardComment, b: BoardComment) =>
  a.createdAt.localeCompare(b.createdAt);

export const useCommentStore = create<CommentState>((set) => ({
  boardId: null,
  threads: [],
  resolvedIds: new Set(),
  pendingIds: new Set(),
  placing: false,
  draft: null,
  openThreadId: null,

  setThreads: (boardId, threads) =>
    set((state) => {
      if (state.boardId !== boardId) {
        return {
          boardId,
          threads,
          resolvedIds: new Set(),
          pendingIds: new Set(),
          placing: false,
          draft: null,
          openThreadId: null,
        };
      }
      // The server's list may predate comments still being saved; keep
      // those so a reload doesn't make them blink out.
      const merged = threads
        .filter((thread) => !state.resolvedIds.has(thread.id))
        .map((thread) => {
          const local = state.threads.find((t) => t.id === thread.id);
          const pending = (local?.comments ?? []).filter(
            (c) =>
              state.pendingIds.has(c.id) &&
              !thread.comments.some((saved) => saved.id === c.id),
          );
          return pending.length > 0
            ? {
                ...thread,
                comments: [...thread.comments, ...pending].sort(byCreatedAt),
              }
            : thread;
        });
      const unsaved = state.threads.filter(
        (local) =>
          !threads.some((thread) => thread.id === local.id) &&
          local.comments.some((c) => state.pendingIds.has(c.id)),
      );
      return { threads: [...merged, ...unsaved] };
    }),

  addComment: (meta, comment, options) =>
    set((state) => {
      if (meta.boardId !== state.boardId || state.resolvedIds.has(meta.id)) {
        return state;
      }
      const pendingIds = options?.pending
        ? new Set(state.pendingIds).add(comment.id)
        : state.pendingIds;
      const existing = state.threads.find((thread) => thread.id === meta.id);
      if (!existing) {
        return {
          pendingIds,
          threads: [...state.threads, { ...meta, comments: [comment] }],
        };
      }
      if (existing.comments.some((c) => c.id === comment.id)) return state;
      const merged = [...existing.comments, comment].sort(byCreatedAt);
      return {
        pendingIds,
        threads: state.threads.map((thread) =>
          thread.id === meta.id ? { ...thread, comments: merged } : thread,
        ),
      };
    }),

  confirmComment: (commentId) =>
    set((state) => {
      if (!state.pendingIds.has(commentId)) return state;
      const pendingIds = new Set(state.pendingIds);
      pendingIds.delete(commentId);
      return { pendingIds };
    }),

  removeComment: (threadId, commentId) =>
    set((state) => {
      const pendingIds = new Set(state.pendingIds);
      pendingIds.delete(commentId);
      const threads = state.threads
        .map((thread) =>
          thread.id === threadId
            ? {
                ...thread,
                comments: thread.comments.filter((c) => c.id !== commentId),
              }
            : thread,
        )
        .filter((thread) => thread.comments.length > 0);
      const gone = !threads.some((thread) => thread.id === threadId);
      return {
        pendingIds,
        threads,
        openThreadId:
          gone && state.openThreadId === threadId ? null : state.openThreadId,
      };
    }),

  removeThread: (threadId) =>
    set((state) => ({
      threads: state.threads.filter((thread) => thread.id !== threadId),
      resolvedIds: new Set(state.resolvedIds).add(threadId),
      openThreadId: state.openThreadId === threadId ? null : state.openThreadId,
    })),

  restoreThread: (thread) =>
    set((state) => {
      if (thread.boardId !== state.boardId) return state;
      const resolvedIds = new Set(state.resolvedIds);
      resolvedIds.delete(thread.id);
      return {
        resolvedIds,
        threads: state.threads.some((t) => t.id === thread.id)
          ? state.threads
          : [...state.threads, thread],
      };
    }),

  setPlacing: (placing) =>
    set(placing ? { placing } : { placing, draft: null }),

  startDraft: (position) => set({ draft: position, openThreadId: null }),

  openThread: (threadId) => set({ openThreadId: threadId, draft: null }),

  dismiss: () => set({ draft: null, openThreadId: null }),
}));

/** Replaces the store's threads with the board's current ones from the server. */
export async function loadCommentThreads(boardId: string): Promise<void> {
  try {
    const threads = await listCommentThreads(boardId);
    useCommentStore.getState().setThreads(boardId, threads);
  } catch (error) {
    console.error("comment load failed", error);
  }
}

// The actions below update the store first and then save. If the save
// fails they roll back and rethrow, so the caller can tell the user.

// Saves of threads created here that are still in flight. Replying to or
// resolving one of them waits for it, since the server can't find it yet.
const threadSaves = new Map<string, Promise<unknown>>();

/** Pins a new thread at `position` and opens it. */
export async function postCommentThread(input: {
  boardId: string;
  position: Position;
  body: string;
  author: CommentAuthor;
}): Promise<void> {
  const threadId = crypto.randomUUID();
  const commentId = crypto.randomUUID();
  const createdAt = new Date().toISOString();
  const store = useCommentStore.getState();
  store.addComment(
    {
      id: threadId,
      boardId: input.boardId,
      position: input.position,
      createdAt,
      author: input.author,
    },
    {
      id: commentId,
      threadId,
      body: input.body,
      createdAt,
      author: input.author,
    },
    { pending: true },
  );
  store.setPlacing(false);
  store.openThread(threadId);

  const save = createCommentThread({
    threadId,
    commentId,
    boardId: input.boardId,
    position: input.position,
    body: input.body,
  });
  threadSaves.set(threadId, save);
  try {
    await save;
    useCommentStore.getState().confirmComment(commentId);
  } catch (error) {
    useCommentStore.getState().removeComment(threadId, commentId);
    throw error;
  } finally {
    threadSaves.delete(threadId);
  }
}

export async function postCommentReply(input: {
  thread: BoardCommentThreadMeta;
  body: string;
  author: CommentAuthor;
}): Promise<void> {
  const commentId = crypto.randomUUID();
  useCommentStore.getState().addComment(
    input.thread,
    {
      id: commentId,
      threadId: input.thread.id,
      body: input.body,
      createdAt: new Date().toISOString(),
      author: input.author,
    },
    { pending: true },
  );

  try {
    await threadSaves.get(input.thread.id);
    await replyToCommentThread({
      threadId: input.thread.id,
      commentId,
      body: input.body,
    });
    useCommentStore.getState().confirmComment(commentId);
  } catch (error) {
    useCommentStore.getState().removeComment(input.thread.id, commentId);
    throw error;
  }
}

export async function resolveThread(thread: BoardCommentThread): Promise<void> {
  useCommentStore.getState().removeThread(thread.id);
  try {
    await threadSaves.get(thread.id);
  } catch {
    // It was never saved, so there's nothing left to resolve.
    return;
  }
  try {
    await resolveCommentThread({ threadId: thread.id });
  } catch (error) {
    useCommentStore.getState().restoreThread(thread);
    throw error;
  }
}
