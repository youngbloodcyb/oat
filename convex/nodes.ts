import { mutation, query } from "./_generated/server";
import { v, type Infer } from "convex/values";
import { authComponent } from "./betterAuth/auth";
import { nodeData, nodeType } from "./schema";
import type { Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";

// Handy TS types derived from the validators (source of truth lives in schema).
export type NodeData = Infer<typeof nodeData>;
export type NodeType = Infer<typeof nodeType>;

const position = v.object({ x: v.number(), y: v.number() });
const style = v.object({ width: v.number(), height: v.number() });

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
  args: {
    boardId: v.id("boards"),
    type: nodeType,
    position,
    data: nodeData,
    style: v.optional(style),
  },
  handler: async (ctx, { boardId, ...node }) => {
    const { user } = await requireBoard(ctx, boardId);
    return await ctx.db.insert("nodes", { boardId, userId: user._id, ...node });
  },
});

// Patch any subset of the persisted fields. `data` is replaced wholesale
// (a discriminated union can't be safely partial-patched); `position` and
// `style` can be updated independently, e.g. on drag/resize.
export const update = mutation({
  args: {
    nodeId: v.id("nodes"),
    position: v.optional(position),
    data: v.optional(nodeData),
    style: v.optional(style),
  },
  handler: async (ctx, { nodeId, ...patch }) => {
    const user = await authComponent.getAuthUser(ctx);
    const node = await ctx.db.get(nodeId);
    if (!node || node.userId !== user._id) throw new Error("Node not found");
    await ctx.db.patch(nodeId, patch);
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
