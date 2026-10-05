import { eq } from "drizzle-orm";
import { defineTool } from "eve/tools";
import { z } from "zod";
import { db } from "@/db";
import { nodes } from "@/db/schema";
import { nodeSearchText, nodeSearchTitle } from "@/lib/node-search";
import { requireBoardAccess } from "@/services/board-access";
import { requireCallerId } from "../lib/caller";

const MAX_NODES = 200;
const EXCERPT_CHARS = 200;

export default defineTool({
  description:
    "List every item on an Oat board with its id, type, title, a short excerpt, and canvas position. Call this first to see what is on the board.",
  inputSchema: z.object({
    boardId: z.string().min(1).describe("The board id from the page context."),
  }),
  label: { start: () => "Reading the board" },
  async execute({ boardId }, ctx) {
    const userId = requireCallerId(ctx);
    const { board } = await requireBoardAccess(boardId, userId, "view");

    const rows = await db
      .select()
      .from(nodes)
      .where(eq(nodes.boardId, boardId))
      .orderBy(nodes.positionY, nodes.positionX)
      .limit(MAX_NODES + 1);

    return {
      board: { id: board.id, name: board.name },
      truncated: rows.length > MAX_NODES,
      nodes: rows.slice(0, MAX_NODES).map((node) => {
        const text = nodeSearchText(node.data);
        return {
          id: node.id,
          type: node.type,
          title: nodeSearchTitle(node.data, text),
          excerpt: text.slice(0, EXCERPT_CHARS),
          position: { x: node.positionX, y: node.positionY },
        };
      }),
    };
  },
});
