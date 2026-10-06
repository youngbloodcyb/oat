import { create } from "zustand";
import type {
  BoardComment,
  BoardCommentThread,
  BoardCommentThreadMeta,
} from "@/lib/comments";
import { listCommentThreads } from "@/services/comments";

type Position = { x: number; y: number };

type CommentState = {
  boardId: string | null;
  threads: BoardCommentThread[];
  // Threads resolved this session, so a late "added" event can't revive them.
  resolvedIds: Set<string>;
  /** True while the dock's comment tool is armed: the next click pins one. */
  placing: boolean;
  /** Where a new, not-yet-posted comment will be pinned (flow coordinates). */
  draft: Position | null;
  openThreadId: string | null;

  setThreads: (boardId: string, threads: BoardCommentThread[]) => void;
  addComment: (thread: BoardCommentThreadMeta, comment: BoardComment) => void;
  removeThread: (threadId: string) => void;
  setPlacing: (placing: boolean) => void;
  startDraft: (position: Position) => void;
  openThread: (threadId: string | null) => void;
  /** Closes any draft or open thread. */
  dismiss: () => void;
};

export const useCommentStore = create<CommentState>((set) => ({
  boardId: null,
  threads: [],
  resolvedIds: new Set(),
  placing: false,
  draft: null,
  openThreadId: null,

  setThreads: (boardId, threads) =>
    set((state) =>
      state.boardId === boardId
        ? {
            threads: threads.filter(
              (thread) => !state.resolvedIds.has(thread.id),
            ),
          }
        : {
            boardId,
            threads,
            resolvedIds: new Set(),
            placing: false,
            draft: null,
            openThreadId: null,
          },
    ),

  addComment: (meta, comment) =>
    set((state) => {
      if (meta.boardId !== state.boardId || state.resolvedIds.has(meta.id)) {
        return state;
      }
      const existing = state.threads.find((thread) => thread.id === meta.id);
      if (!existing) {
        return {
          threads: [...state.threads, { ...meta, comments: [comment] }],
        };
      }
      if (existing.comments.some((c) => c.id === comment.id)) return state;
      const merged = [...existing.comments, comment].sort((a, b) =>
        a.createdAt.localeCompare(b.createdAt),
      );
      return {
        threads: state.threads.map((thread) =>
          thread.id === meta.id ? { ...thread, comments: merged } : thread,
        ),
      };
    }),

  removeThread: (threadId) =>
    set((state) => ({
      threads: state.threads.filter((thread) => thread.id !== threadId),
      resolvedIds: new Set(state.resolvedIds).add(threadId),
      openThreadId: state.openThreadId === threadId ? null : state.openThreadId,
    })),

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
