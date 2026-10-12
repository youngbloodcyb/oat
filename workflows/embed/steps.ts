import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { embeddings, nodes, palettes } from "@/db/schema";
import { embedSearchDocument, embedSearchImage } from "@/lib/embedding";
import { loadImageEmbeddingInput } from "@/lib/image-embedding";
import { nodeSearchTitle } from "@/lib/node-search";
import {
  extractPaletteCandidates,
  loadPaletteImage,
  type Palette,
  scorePaletteHeuristically,
} from "@/lib/palette";
import { scorePaletteWithModel } from "@/lib/palette-decisions";

export type NodeEmbeddingSource =
  | {
      kind: "text";
      sourceKey: string;
      title: string;
      text: string;
    }
  | {
      kind: "image";
      sourceKey: string;
      objectKey: string;
    };

export async function stepGetNodeEmbeddingSource(
  nodeId: string,
): Promise<NodeEmbeddingSource | null> {
  "use step";

  const rows = await db
    .select({
      data: nodes.data,
      searchText: nodes.searchText,
      sourceKey: nodes.embeddingSource,
    })
    .from(nodes)
    .where(eq(nodes.id, nodeId))
    .limit(1);
  const node = rows[0];
  if (!node?.sourceKey) return null;

  if (node.data.kind === "image") {
    return node.data.objectKey
      ? {
          kind: "image",
          sourceKey: node.sourceKey,
          objectKey: node.data.objectKey,
        }
      : null;
  }

  if (!node.searchText) return null;
  return {
    kind: "text",
    sourceKey: node.sourceKey,
    title: nodeSearchTitle(node.data, node.searchText),
    text: node.searchText,
  };
}

export async function stepEmbedText(input: {
  title: string;
  text: string;
}): Promise<number[]> {
  "use step";

  return embedSearchDocument(input);
}

export async function stepEmbedImage(objectKey: string): Promise<number[]> {
  "use step";

  const image = await loadImageEmbeddingInput(objectKey);
  return embedSearchImage(image);
}

export async function stepUpsertEmbedding(params: {
  nodeId: string;
  sourceKey: string;
  embedding: number[];
}) {
  "use step";

  const vector = JSON.stringify(params.embedding);
  await db.execute(sql`
    INSERT INTO ${embeddings} (
      ${sql.identifier(embeddings.nodeId.name)},
      ${sql.identifier(embeddings.boardId.name)},
      ${sql.identifier(embeddings.userId.name)},
      ${sql.identifier(embeddings.sourceKey.name)},
      ${sql.identifier(embeddings.embedding.name)}
    )
    SELECT
      ${nodes.id},
      ${nodes.boardId},
      ${nodes.userId},
      ${nodes.embeddingSource},
      ${vector}::vector
    FROM ${nodes}
    WHERE ${nodes.id} = ${params.nodeId}
      AND ${nodes.embeddingSource} = ${params.sourceKey}
    ON CONFLICT (${sql.identifier(embeddings.nodeId.name)}) DO UPDATE SET
      ${sql.identifier(embeddings.boardId.name)} = EXCLUDED.${sql.identifier(
        embeddings.boardId.name,
      )},
      ${sql.identifier(embeddings.userId.name)} = EXCLUDED.${sql.identifier(
        embeddings.userId.name,
      )},
      ${sql.identifier(embeddings.sourceKey.name)} = EXCLUDED.${sql.identifier(
        embeddings.sourceKey.name,
      )},
      ${sql.identifier(embeddings.embedding.name)} = EXCLUDED.${sql.identifier(
        embeddings.embedding.name,
      )}
  `);
}

export async function stepDeleteEmbedding(nodeId: string) {
  "use step";

  await db.delete(embeddings).where(eq(embeddings.nodeId, nodeId));
}

export async function stepExtractPalette(objectKey: string): Promise<Palette> {
  "use step";

  const image = await loadPaletteImage(objectKey);
  const candidates = extractPaletteCandidates(image.pixels);
  if (candidates.length === 0) return { scoredBy: "heuristic", colors: [] };

  try {
    return {
      scoredBy: "model",
      colors: await scorePaletteWithModel({
        candidates,
        preview: image.preview,
      }),
    };
  } catch (error) {
    // The palette is still useful without the model's judgment.
    console.error("palette decision failed", { objectKey, error });
    return {
      scoredBy: "heuristic",
      colors: scorePaletteHeuristically(candidates),
    };
  }
}

export async function stepUpsertPalette(params: {
  nodeId: string;
  sourceKey: string;
  palette: Palette;
}) {
  "use step";

  // Skipped when the node was deleted or its image replaced meanwhile.
  await db.execute(sql`
    INSERT INTO ${palettes} (
      ${sql.identifier(palettes.nodeId.name)},
      ${sql.identifier(palettes.boardId.name)},
      ${sql.identifier(palettes.sourceKey.name)},
      ${sql.identifier(palettes.scoredBy.name)},
      ${sql.identifier(palettes.colors.name)}
    )
    SELECT
      ${nodes.id},
      ${nodes.boardId},
      ${nodes.embeddingSource},
      ${params.palette.scoredBy},
      ${JSON.stringify(params.palette.colors)}::jsonb
    FROM ${nodes}
    WHERE ${nodes.id} = ${params.nodeId}
      AND ${nodes.embeddingSource} = ${params.sourceKey}
    ON CONFLICT (${sql.identifier(palettes.nodeId.name)}) DO UPDATE SET
      ${sql.identifier(palettes.sourceKey.name)} = EXCLUDED.${sql.identifier(
        palettes.sourceKey.name,
      )},
      ${sql.identifier(palettes.scoredBy.name)} = EXCLUDED.${sql.identifier(
        palettes.scoredBy.name,
      )},
      ${sql.identifier(palettes.colors.name)} = EXCLUDED.${sql.identifier(
        palettes.colors.name,
      )},
      ${sql.identifier(palettes.updatedAt.name)} = now()
  `);
}
