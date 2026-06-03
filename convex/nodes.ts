import { mutation, query } from "./_generated/server";
import { v, type Infer } from "convex/values";
import { authComponent } from "./betterAuth/auth";
import { nodeData } from "./schema";
import type { Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";

// Handy TS type for the node payload, derived from the validator.
export type NodeData = Infer<typeof nodeData>;

// Shared guard: ensures the signed-in user owns the given board.
async function requireBoard(ctx: QueryCtx, boardId: Id<"boards">) {
  const user = await authComponent.getAuthUser(ctx);
  const board = await ctx.db.get(boardId);
  if (!board || board.userId !== user._id) throw new Error("Board not found");
  return { user, board };
}

export const listByBoard = query({
  args: { boardId: v.id("boards") },
  handler: async (ctx, { boardId }) => {
    const user = await authComponent.safeGetAuthUser(ctx);
    if (!user) return [];
    const board = await ctx.db.get(boardId);
    if (!board || board.userId !== user._id) return [];
    return await ctx.db
      .query("nodes")
      .withIndex("by_board", (q) => q.eq("boardId", boardId))
      .collect();
  },
});

export const create = mutation({
  args: { boardId: v.id("boards"), data: nodeData },
  handler: async (ctx, { boardId, data }) => {
    const { user } = await requireBoard(ctx, boardId);
    return await ctx.db.insert("nodes", { boardId, userId: user._id, data });
  },
});

export const update = mutation({
  args: { nodeId: v.id("nodes"), data: nodeData },
  handler: async (ctx, { nodeId, data }) => {
    const user = await authComponent.getAuthUser(ctx);
    const node = await ctx.db.get(nodeId);
    if (!node || node.userId !== user._id) throw new Error("Node not found");
    // Replace the whole payload. Use ctx.db.patch with a partial if you'd
    // rather merge top-level keys instead of overwriting.
    await ctx.db.patch(nodeId, { data });
  },
});

export const remove = mutation({
  args: { nodeId: v.id("nodes") },
  handler: async (ctx, { nodeId }) => {
    const user = await authComponent.getAuthUser(ctx);
    const node = await ctx.db.get(nodeId);
    if (!node || node.userId !== user._id) throw new Error("Node not found");
    await ctx.db.delete(nodeId);
  },
});
