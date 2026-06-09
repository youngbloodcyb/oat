import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

// The STORED node payload — source of truth for what lives in the DB. Note
// image/pdf reference content by either `storageId` (a file uploaded to
// Convex storage) or an external `url`. The query resolves whichever is set
// into a `src` URL for the client (see nodes.listByBoard), so the shape the
// UI consumes differs slightly from what's stored here.
export const nodeData = v.union(
  v.object({
    kind: v.literal("link"),
    url: v.string(),
    og: v.optional(
      v.object({
        title: v.optional(v.string()),
        description: v.optional(v.string()),
        image: v.optional(v.string()),
        siteName: v.optional(v.string()),
      }),
    ),
  }),
  v.object({
    kind: v.literal("text"),
    text: v.string(),
  }),
  v.object({
    kind: v.literal("image"),
    storageId: v.optional(v.id("_storage")),
    url: v.optional(v.string()),
    alt: v.optional(v.string()),
    // How the image fills its node box (CSS object-fit). Defaults to cover.
    fit: v.optional(v.union(v.literal("cover"), v.literal("contain"))),
  }),
  v.object({
    kind: v.literal("pdf"),
    storageId: v.optional(v.id("_storage")),
    url: v.optional(v.string()),
    name: v.string(),
  }),
);

// The persisted subset of a React Flow node. We deliberately do NOT store
// runtime/UI state (selected, dragging, measured, computed width/height,
// handle bookkeeping) — only what's needed to reconstruct the node on read.
export const nodeType = v.union(
  v.literal("link"),
  v.literal("text"),
  v.literal("image"),
  v.literal("pdf"),
);

export default defineSchema({
  // The auth `user` table lives in the better-auth component
  // (convex/betterAuth/schema.ts), a separate namespace, so we can't use
  // v.id("user") for the owner. Store the better-auth user._id as a string.
  boards: defineTable({
    userId: v.string(), // better-auth user._id (owner)
    name: v.string(),
  }).index("by_user", ["userId"]),

  nodes: defineTable({
    boardId: v.id("boards"),
    userId: v.string(), // denormalized owner for cheap auth checks
    type: nodeType,
    position: v.object({ x: v.number(), y: v.number() }),
    data: nodeData,
    style: v.optional(v.object({ width: v.number(), height: v.number() })),
    zIndex: v.optional(v.number()), // stacking order (bring-to-front)
  })
    .index("by_board", ["boardId"])
    .index("by_user", ["userId"]),

  // One embedding per node, written by a scheduled action after create/edit.
  embeddings: defineTable({
    nodeId: v.id("nodes"),
    boardId: v.id("boards"),
    userId: v.string(),
    embedding: v.array(v.float64()),
  })
    .index("by_node", ["nodeId"])
    .vectorIndex("by_embedding", {
      vectorField: "embedding",
      dimensions: 1536, // OpenAI text-embedding-3-small
      filterFields: ["userId", "boardId"],
    }),
});
