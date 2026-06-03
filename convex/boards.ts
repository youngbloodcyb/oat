import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { authComponent } from "./betterAuth/auth";

export const list = query({
  args: {},
  handler: async (ctx) => {
    const user = await authComponent.safeGetAuthUser(ctx);
    if (!user) return [];
    return await ctx.db
      .query("boards")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .order("desc")
      .collect();
  },
});

export const get = query({
  args: { boardId: v.id("boards") },
  handler: async (ctx, { boardId }) => {
    const user = await authComponent.safeGetAuthUser(ctx);
    if (!user) return null;
    const board = await ctx.db.get(boardId);
    if (!board || board.userId !== user._id) return null;
    return board;
  },
});

export const create = mutation({
  args: { name: v.string(), data: v.optional(v.any()) },
  handler: async (ctx, args) => {
    const user = await authComponent.getAuthUser(ctx);
    return await ctx.db.insert("boards", { userId: user._id, ...args });
  },
});

export const update = mutation({
  args: {
    boardId: v.id("boards"),
    name: v.optional(v.string()),
    data: v.optional(v.any()),
  },
  handler: async (ctx, { boardId, ...patch }) => {
    const user = await authComponent.getAuthUser(ctx);
    const board = await ctx.db.get(boardId);
    if (!board || board.userId !== user._id) throw new Error("Not found");
    await ctx.db.patch(boardId, patch);
  },
});

export const remove = mutation({
  args: { boardId: v.id("boards") },
  handler: async (ctx, { boardId }) => {
    const user = await authComponent.getAuthUser(ctx);
    const board = await ctx.db.get(boardId);
    if (!board || board.userId !== user._id) throw new Error("Not found");
    // Cascade: delete the board's nodes too.
    const nodes = await ctx.db
      .query("nodes")
      .withIndex("by_board", (q) => q.eq("boardId", boardId))
      .collect();
    await Promise.all(nodes.map((n) => ctx.db.delete(n._id)));
    await ctx.db.delete(boardId);
  },
});
