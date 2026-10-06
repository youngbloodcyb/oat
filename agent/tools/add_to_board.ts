import { eq } from "drizzle-orm";
import { defineTool } from "eve/tools";
import { db } from "@/db";
import { type NodeData, type NodeType, nodes } from "@/db/schema";
import {
  addToBoardSchema,
  type BoardAddition,
  placeAdditions,
  textToHtml,
} from "@/lib/board-additions";
import { detectFromText } from "@/lib/board-utils";
import { embedNodeSize, parseEmbed } from "@/lib/embed";
import { DEFAULT_STYLE } from "@/lib/node-style";
import { requireBoardAccess } from "@/services/board-access";
import { insertNode } from "@/services/node-writes";
import { requireCallerId } from "../lib/caller";

function toNode(item: BoardAddition): { type: NodeType; data: NodeData } {
  if (item.type === "text") {
    return {
      type: "text",
      data: { kind: "text", text: textToHtml(item.text) },
    };
  }
  // Same detection as pasting a URL: a link to a .pdf becomes a PDF node.
  const draft = detectFromText(item.url);
  return draft.kind === "pdf" && "url" in draft
    ? { type: "pdf", data: { kind: "pdf", url: draft.url, name: draft.name } }
    : { type: "link", data: { kind: "link", url: item.url } };
}

function sizeOf(node: { type: NodeType; data: NodeData }) {
  const embed = node.data.kind === "link" ? parseEmbed(node.data.url) : null;
  return embed ? embedNodeSize(embed) : DEFAULT_STYLE[node.type];
}

export default defineTool({
  description:
    "Add links or text notes to the person's Oat board. The person sees an approval card listing every item and must approve before anything is added. Use it when they ask you to put something on the board.",
  inputSchema: addToBoardSchema,
  // Every call waits for the person. Callers who can only view the board are
  // turned away before they see a card they couldn't act on.
  approval: async ({ session, toolInput }) => {
    const caller = session.auth.current;
    if (!caller || caller.principalType !== "user" || !toolInput?.boardId) {
      return { type: "denied", reason: "A signed-in Oat user is required." };
    }
    try {
      await requireBoardAccess(toolInput.boardId, caller.principalId, "edit");
    } catch {
      return { type: "denied", reason: "This person can only view the board." };
    }
    return "user-approval";
  },
  label: {
    start: ({ items }) =>
      `Adding ${items.length} item${items.length === 1 ? "" : "s"} to the board`,
  },
  async execute({ boardId, items }, ctx) {
    const userId = requireCallerId(ctx);
    await requireBoardAccess(boardId, userId, "edit");

    const existing = await db
      .select({
        type: nodes.type,
        x: nodes.positionX,
        y: nodes.positionY,
        width: nodes.width,
        height: nodes.height,
        zIndex: nodes.zIndex,
      })
      .from(nodes)
      .where(eq(nodes.boardId, boardId));

    const planned = items.map(toNode);
    const sizes = planned.map(sizeOf);
    const positions = placeAdditions(
      existing.map((n) => ({
        x: n.x,
        y: n.y,
        width: n.width ?? DEFAULT_STYLE[n.type].width,
        height: n.height ?? DEFAULT_STYLE[n.type].height,
      })),
      sizes,
    );
    const zIndex = Math.max(0, ...existing.map((n) => n.zIndex ?? 0)) + 1;

    const added = [];
    for (const [index, node] of planned.entries()) {
      added.push(
        await insertNode({
          userId,
          boardId,
          type: node.type,
          data: node.data,
          position: positions[index],
          style: sizes[index],
          zIndex,
        }),
      );
    }
    return { added };
  },
});
