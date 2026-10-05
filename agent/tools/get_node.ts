import { defineTool } from "eve/tools";
import { z } from "zod";
import type { NodeData } from "@/db/schema";
import { nodeSearchText } from "@/lib/node-search";
import { requireNodeAccess } from "@/services/board-access";
import { requireCallerId } from "../lib/caller";

const PAGE_CHARS = 20_000;

function nodeContent(data: NodeData) {
  switch (data.kind) {
    case "text":
      return { text: nodeSearchText(data) };
    case "link":
      return {
        url: data.url,
        title: data.og?.title,
        description: data.og?.description,
        siteName: data.og?.siteName,
        text: "",
      };
    case "image":
      return { alt: data.alt, text: "" };
    case "pdf":
      return { name: data.name, text: data.markdown ?? "" };
  }
}

export default defineTool({
  description:
    "Read one item on an Oat board in full: a text note's contents, a link's URL and preview, an image's alt text, or a PDF's extracted text. Long text is paged; pass `offset` to continue.",
  inputSchema: z.object({
    nodeId: z.string().min(1),
    offset: z.number().int().min(0).optional(),
  }),
  label: { start: () => "Reading an item" },
  async execute({ nodeId, offset = 0 }, ctx) {
    const userId = requireCallerId(ctx);
    const { node } = await requireNodeAccess(nodeId, userId, "view");

    const { text, ...details } = nodeContent(node.data);
    const end = offset + PAGE_CHARS;
    return {
      id: node.id,
      boardId: node.boardId,
      type: node.type,
      ...details,
      text: text.slice(offset, end),
      totalChars: text.length,
      nextOffset: end < text.length ? end : null,
    };
  },
});
