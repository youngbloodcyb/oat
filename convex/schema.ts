import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

// Discriminated union for node payloads. Each branch is tagged by `kind`,
// so reads narrow correctly (if data.kind === "link", `url` is known) and
// every write is validated at runtime. Add a new node type by adding a
// branch here — existing kinds keep validating unchanged.
export const nodeData = v.union(
  v.object({
    kind: v.literal("text"),
    text: v.string(),
  }),
  v.object({
    kind: v.literal("link"),
    url: v.string(),
    title: v.optional(v.string()),
  }),
  v.object({
    kind: v.literal("image"),
    // Convex file storage id; swap for v.string() if you store external URLs.
    storageId: v.id("_storage"),
    alt: v.optional(v.string()),
  }),
  v.object({
    kind: v.literal("todo"),
    items: v.array(v.object({ text: v.string(), done: v.boolean() })),
  }),
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
    data: nodeData,
  })
    .index("by_board", ["boardId"])
    .index("by_user", ["userId"]),
});
