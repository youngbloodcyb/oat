import { embed } from "ai";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import { internalAction, internalMutation } from "./_generated/server";

// The text to embed for a node, or null if it has nothing textual to embed.
function embeddableText(node: Doc<"nodes">): string | null {
  const d = node.data;
  if (d.kind === "text") {
    const text = d.text
      .replace(/<[^>]*>/g, " ") // strip HTML tags
      .replace(/\s+/g, " ")
      .trim();
    return text || null;
  }
  if (d.kind === "link") {
    const text = [d.og?.title, d.og?.description, d.url]
      .filter(Boolean)
      .join(" ")
      .trim();
    return text || null;
  }
  return null; // image / pdf: no text embedding for now
}

async function embedText(text: string): Promise<number[]> {
  // Google gemini-embedding via Vercel AI Gateway. Pin output to 1536 dims to
  // match the vector index.
  const { embedding } = await embed({
    model: "google/gemini-embedding-2",
    value: text,
    providerOptions: { google: { outputDimensionality: 1536 } },
  });
  return embedding;
}

// Background job: embed a node and store the vector. Scheduled from
// nodes.create / nodes.update.
export const embedNode = internalAction({
  args: { nodeId: v.id("nodes") },
  handler: async (ctx, { nodeId }) => {
    const node = await ctx.runQuery(internal.nodes.getInternal, { nodeId });
    if (!node) return; // deleted before we ran
    const text = embeddableText(node);
    if (!text) return; // nothing to embed (e.g. an image)
    const embedding = await embedText(text);
    await ctx.runMutation(internal.embeddings.upsert, {
      nodeId,
      boardId: node.boardId,
      userId: node.userId,
      embedding,
    });
  },
});

export const upsert = internalMutation({
  args: {
    nodeId: v.id("nodes"),
    boardId: v.id("boards"),
    userId: v.string(),
    embedding: v.array(v.float64()),
  },
  handler: async (ctx, { nodeId, boardId, userId, embedding }) => {
    const existing = await ctx.db
      .query("embeddings")
      .withIndex("by_node", (q) => q.eq("nodeId", nodeId))
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, { embedding, boardId, userId });
    } else {
      await ctx.db.insert("embeddings", { nodeId, boardId, userId, embedding });
    }
  },
});
