import { eq } from "drizzle-orm";
import { defineTool } from "eve/tools";
import { z } from "zod";
import { db } from "@/db";
import { nodes, type StoredNode } from "@/db/schema";
import { nodeSearchText, nodeSearchTitle } from "@/lib/node-search";
import { DEFAULT_STYLE } from "@/lib/node-style";
import { requireBoardAccess } from "@/services/board-access";
import { queryCommentThreads } from "@/services/comment-reads";
import { requireCallerId } from "../lib/caller";

const MAX_THREADS = 100;

// The item a comment was pinned onto: the topmost one whose bounds hold the
// pin's point. Null when it was dropped on empty board.
function pinnedItem(point: { x: number; y: number }, boardNodes: StoredNode[]) {
  const hit = boardNodes
    .filter((node) => {
      const size = DEFAULT_STYLE[node.type];
      const width = node.width ?? size.width;
      const height = node.height ?? size.height;
      return (
        point.x >= node.positionX &&
        point.x <= node.positionX + width &&
        point.y >= node.positionY &&
        point.y <= node.positionY + height
      );
    })
    .sort((a, b) => (b.zIndex ?? 0) - (a.zIndex ?? 0))[0];
  if (!hit) return null;
  return {
    id: hit.id,
    type: hit.type,
    title: nodeSearchTitle(hit.data, nodeSearchText(hit.data)),
  };
}

export default defineTool({
  description:
    "Read the open comment threads people have pinned on an Oat board: who wrote each comment and reply, when, and which item (if any) each thread is pinned to. Resolved threads are deleted and won't appear.",
  inputSchema: z.object({
    boardId: z.string().min(1).describe("The board id from the page context."),
  }),
  label: { start: () => "Reading comments" },
  async execute({ boardId }, ctx) {
    const userId = requireCallerId(ctx);
    const { board } = await requireBoardAccess(boardId, userId, "view");

    const [threads, boardNodes] = await Promise.all([
      queryCommentThreads(boardId),
      db.select().from(nodes).where(eq(nodes.boardId, boardId)),
    ]);

    return {
      board: { id: board.id, name: board.name },
      truncated: threads.length > MAX_THREADS,
      // Keep the newest threads when there are too many.
      threads: threads.slice(-MAX_THREADS).map((thread) => ({
        id: thread.id,
        position: thread.position,
        pinnedTo: pinnedItem(thread.position, boardNodes),
        comments: thread.comments.map((comment) => ({
          author: comment.author.name,
          createdAt: comment.createdAt,
          body: comment.body,
        })),
      })),
    };
  },
});
