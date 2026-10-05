"use server";

import { z } from "zod";
import { requireUser } from "@/lib/auth-server";
import { embedSearchQuery } from "@/lib/embedding";
import { type NodeSearchResult, runSearch } from "@/lib/search-query";

const searchInputSchema = z.object({
  query: z.string().trim().max(500),
  boardId: z.string().min(1).max(100).optional(),
  limit: z.number().int().min(1).max(50).default(20),
});

export type SearchNodesInput = z.input<typeof searchInputSchema>;

export type { NodeSearchResult };

export type BoardSearchResults = {
  currentBoard: NodeSearchResult[];
  otherBoards: NodeSearchResult[];
};

export async function searchNodes(
  input: SearchNodesInput,
): Promise<NodeSearchResult[]> {
  const user = await requireUser();
  const parsed = searchInputSchema.safeParse(input);
  if (!parsed.success) throw new Error("Invalid search query");

  const { query, boardId, limit } = parsed.data;
  if (!query) return [];

  const queryEmbedding = JSON.stringify(await embedSearchQuery(query));
  return runSearch({
    userId: user.id,
    query,
    queryEmbedding,
    limit,
    scope: boardId ? { boardId, mode: "only" } : undefined,
  });
}

/**
 * Ranks the current board separately from the rest, so matches elsewhere
 * can't crowd the current board's matches out of a shared top-N.
 */
export async function searchNodesByBoard(
  input: SearchNodesInput & { boardId: string },
): Promise<BoardSearchResults> {
  const user = await requireUser();
  const parsed = searchInputSchema.required({ boardId: true }).safeParse(input);
  if (!parsed.success) throw new Error("Invalid search query");

  const { query, boardId, limit } = parsed.data;
  if (!query) return { currentBoard: [], otherBoards: [] };

  const queryEmbedding = JSON.stringify(await embedSearchQuery(query));
  const base = { userId: user.id, query, queryEmbedding, limit };
  const [currentBoard, otherBoards] = await Promise.all([
    runSearch({ ...base, scope: { boardId, mode: "only" } }),
    runSearch({ ...base, scope: { boardId, mode: "exclude" } }),
  ]);
  return { currentBoard, otherBoards };
}
