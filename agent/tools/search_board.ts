import { defineTool } from "eve/tools";
import { z } from "zod";
import { embedSearchQuery } from "@/lib/embedding";
import { runSearch } from "@/lib/search-query";
import { requireBoardAccess } from "@/services/board-access";
import { requireCallerId } from "../lib/caller";

export default defineTool({
  description:
    "Search the items on an Oat board by meaning and keywords. Returns the best matches with ids and excerpts; use get_node to read one in full.",
  inputSchema: z.object({
    boardId: z.string().min(1).describe("The board id from the page context."),
    query: z.string().trim().min(1).max(500),
    limit: z.number().int().min(1).max(20).optional(),
  }),
  label: { start: ({ query }) => `Searching the board for “${query}”` },
  async execute({ boardId, query, limit }, ctx) {
    const userId = requireCallerId(ctx);
    await requireBoardAccess(boardId, userId, "view");

    const results = await runSearch({
      userId,
      query,
      queryEmbedding: JSON.stringify(await embedSearchQuery(query)),
      limit: limit ?? 10,
      scope: { boardId, mode: "only" },
    });

    return {
      results: results.map((result) => ({
        id: result.nodeId,
        type: result.type,
        title: result.title,
        excerpt: result.excerpt,
      })),
    };
  },
});
