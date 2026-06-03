import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

// Discriminated union for node payloads — the source of truth for node
// shape. Each branch is tagged by `kind`, so reads narrow correctly and
// every write is validated at runtime. The client imports the generated
// type (Infer<typeof nodeData>) instead of hand-defining these.
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
    kind: v.literal("image"),
    src: v.string(),
    alt: v.optional(v.string()),
  }),
  v.object({
    kind: v.literal("pdf"),
    src: v.string(),
    name: v.string(),
  }),
);

// The persisted subset of a React Flow node. We deliberately do NOT store
// runtime/UI state (selected, dragging, measured, computed width/height,
// handle bookkeeping) — only what's needed to reconstruct the node on read.
export const nodeType = v.union(
  v.literal("link"),
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
  })
    .index("by_board", ["boardId"])
    .index("by_user", ["userId"]),
});
