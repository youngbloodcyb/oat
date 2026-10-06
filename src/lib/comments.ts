export const MAX_COMMENT_CHARS = 2_000;

export type CommentAuthor = {
  id: string;
  name: string;
  image: string | null;
};

export type BoardComment = {
  id: string;
  threadId: string;
  body: string;
  /** ISO timestamp. */
  createdAt: string;
  author: CommentAuthor;
};

export type BoardCommentThreadMeta = {
  id: string;
  boardId: string;
  position: { x: number; y: number };
  createdAt: string;
  author: CommentAuthor;
};

export type BoardCommentThread = BoardCommentThreadMeta & {
  /** Oldest first; the first one opened the thread. */
  comments: BoardComment[];
};
