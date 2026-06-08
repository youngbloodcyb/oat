import { mutation, query } from "./_generated/server";
import { v, type Infer } from "convex/values";
import { authComponent } from "./betterAuth/auth";
import { nodeData, nodeType } from "./schema";
import type { Doc, Id } from "./_generated/dataModel";
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

// Resolve the STORED node data into the shape the client renders: image/pdf
// `storageId | url` collapse into a single `src` URL. Links pass through.
async function toClientData(ctx: QueryCtx, data: Doc<"nodes">["data"]) {
  if (data.kind === "image" || data.kind === "pdf") {
    const src = data.storageId
      ? ((await ctx.storage.getUrl(data.storageId)) ?? "")
      : (data.url ?? "");
    return data.kind === "image"
      ? { kind: "image" as const, src, alt: data.alt }
      : { kind: "pdf" as const, src, name: data.name };
  }
  return data; // link
}

// A signed URL the client POSTs file bytes to before creating a file node.
export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    await authComponent.getAuthUser(ctx); // require a signed-in user
    return await ctx.storage.generateUploadUrl();
  },
});

export const listByBoard = query({
  args: { boardId: v.id("boards") },
  handler: async (ctx, { boardId }) => {
    const user = await authComponent.safeGetAuthUser(ctx);
    if (!user) return [];
    const board = await ctx.db.get(boardId);
    if (!board || board.userId !== user._id) return [];
    const nodes = await ctx.db
      .query("nodes")
      .withIndex("by_board", (q) => q.eq("boardId", boardId))
      .collect();
    return await Promise.all(
      nodes.map(async (n) => ({
        _id: n._id,
        type: n.type,
        position: n.position,
        style: n.style,
        zIndex: n.zIndex,
        data: await toClientData(ctx, n.data),
      })),
    );
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
    zIndex: v.optional(v.number()),
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
    // Clean up the backing file so deleting a node doesn't orphan storage.
    if (
      (node.data.kind === "image" || node.data.kind === "pdf") &&
      node.data.storageId
    ) {
      await ctx.storage.delete(node.data.storageId);
    }
    await ctx.db.delete(nodeId);
  },
});
