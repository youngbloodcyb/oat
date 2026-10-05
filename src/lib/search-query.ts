import { type SQL, sql } from "drizzle-orm";
import { db } from "@/db";
import type { NodeData, NodeType } from "@/db/schema";
import { nodeSearchTitle } from "@/lib/node-search";

// Shared by the search server actions and the agent's board tools. Callers
// must pass an authenticated `userId`; it is never accepted from a client.

export type NodeSearchResult = {
  nodeId: string;
  boardId: string;
  boardName: string;
  type: NodeType;
  title: string;
  excerpt: string;
  position: { x: number; y: number };
  score: number;
  matchedBy: {
    keyword: boolean;
    semantic: boolean;
  };
};

type SearchRow = {
  nodeId: string;
  boardId: string;
  boardName: string;
  type: NodeType;
  data: NodeData;
  excerpt: string;
  positionX: number;
  positionY: number;
  score: number | string;
  keywordMatch: boolean;
  semanticMatch: boolean;
};

type BoardScope = { boardId: string; mode: "only" | "exclude" };

function boardFilter(column: SQL, scope: BoardScope | undefined): SQL {
  if (!scope) return sql``;
  return scope.mode === "only"
    ? sql`AND ${column} = ${scope.boardId}`
    : sql`AND ${column} <> ${scope.boardId}`;
}

export async function runSearch({
  userId,
  query,
  queryEmbedding,
  limit,
  scope,
}: {
  userId: string;
  query: string;
  queryEmbedding: string;
  limit: number;
  scope?: BoardScope;
}): Promise<NodeSearchResult[]> {
  const candidateLimit = Math.min(Math.max(limit * 5, 50), 200);
  const semanticBoardFilter = boardFilter(sql`e.board_id`, scope);
  const keywordBoardFilter = boardFilter(sql`n.board_id`, scope);
  const finalBoardFilter = boardFilter(sql`n.board_id`, scope);

  const result = await db.execute<SearchRow>(sql`
    WITH accessible_boards AS (
      SELECT b.id
      FROM boards b
      WHERE b.user_id = ${userId}
        OR EXISTS (
          SELECT 1
          FROM board_shares bs
          WHERE bs.board_id = b.id
            AND bs.user_id = ${userId}
        )
    ),
    semantic_candidates AS (
      SELECT
        e.node_id,
        e.embedding <=> ${queryEmbedding}::vector AS distance
      FROM embeddings e
      INNER JOIN accessible_boards accessible
        ON accessible.id = e.board_id
      INNER JOIN nodes indexed_node
        ON indexed_node.id = e.node_id
        AND indexed_node.user_id = e.user_id
        AND indexed_node.board_id = e.board_id
        AND indexed_node.embedding_source = e.source_key
      WHERE true
        ${semanticBoardFilter}
      ORDER BY e.embedding <=> ${queryEmbedding}::vector
      LIMIT ${candidateLimit}
    ),
    semantic AS (
      SELECT
        node_id,
        row_number() OVER (ORDER BY distance) AS rank
      FROM semantic_candidates
    ),
    keyword_candidates AS (
      SELECT
        n.id AS node_id,
        ts_rank_cd(
          to_tsvector('simple', n.search_text),
          websearch_to_tsquery('simple', ${query})
        ) AS relevance
      FROM nodes n
      INNER JOIN accessible_boards accessible
        ON accessible.id = n.board_id
      WHERE true
        ${keywordBoardFilter}
        AND to_tsvector('simple', n.search_text)
          @@ websearch_to_tsquery('simple', ${query})
      ORDER BY relevance DESC
      LIMIT ${candidateLimit}
    ),
    keyword AS (
      SELECT
        node_id,
        row_number() OVER (ORDER BY relevance DESC) AS rank
      FROM keyword_candidates
    ),
    candidates AS (
      SELECT node_id FROM semantic
      UNION
      SELECT node_id FROM keyword
    )
    SELECT
      n.id AS "nodeId",
      n.board_id AS "boardId",
      b.name AS "boardName",
      n.type,
      n.data,
      left(n.search_text, 280) AS excerpt,
      n.position_x AS "positionX",
      n.position_y AS "positionY",
      (
        COALESCE(1.0 / (60 + semantic.rank), 0) +
        COALESCE(1.0 / (60 + keyword.rank), 0)
      )::double precision AS score,
      keyword.rank IS NOT NULL AS "keywordMatch",
      semantic.rank IS NOT NULL AS "semanticMatch"
    FROM candidates
    INNER JOIN nodes n ON n.id = candidates.node_id
    INNER JOIN boards b ON b.id = n.board_id
    INNER JOIN accessible_boards accessible ON accessible.id = n.board_id
    LEFT JOIN semantic ON semantic.node_id = n.id
    LEFT JOIN keyword ON keyword.node_id = n.id
    WHERE true
      ${finalBoardFilter}
    ORDER BY score DESC, n.updated_at DESC
    LIMIT ${limit}
  `);

  return result.rows.map((row) => ({
    nodeId: row.nodeId,
    boardId: row.boardId,
    boardName: row.boardName,
    type: row.type,
    title: nodeSearchTitle(row.data, row.excerpt),
    excerpt: row.excerpt,
    position: { x: row.positionX, y: row.positionY },
    score: Number(row.score),
    matchedBy: {
      keyword: row.keywordMatch,
      semantic: row.semanticMatch,
    },
  }));
}
