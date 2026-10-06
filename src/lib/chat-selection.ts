import { z } from "zod";
import type { NodeType } from "@/db/schema";
import { normalizeText } from "@/lib/node-search";
import type { BoardNode } from "@/lib/store";

// The board items someone had selected when they sent a chat message. They
// ride along inside the message as a tagged JSON block, so the agent sees
// them in its history on later turns too, and the chat can show them again
// after a reload.

const MAX_ITEMS = 25;
const MAX_TITLE_CHARS = 80;
const TAG = "board-selection";
const BLOCK_PATTERN = new RegExp(`\\s*<${TAG}>([\\s\\S]*?)</${TAG}>\\s*`);

const nodeTypeSchema = z.enum(["link", "text", "image", "pdf"]);

const selectionSchema = z.object({
  items: z.array(
    z.object({
      id: z.string(),
      type: nodeTypeSchema,
      title: z.string(),
    }),
  ),
});

export type SelectionItem = { id: string; type: NodeType; title: string };

function nodeTitle(node: BoardNode): string {
  const data = node.data;
  switch (data.kind) {
    case "text":
      return normalizeText(data.text) || "Untitled text";
    case "link":
      return data.og?.title?.trim() || data.url;
    case "image":
      return data.alt?.trim() || "Image";
    case "pdf":
      return data.name;
  }
}

export function selectedItems(nodes: readonly BoardNode[]): SelectionItem[] {
  return nodes
    .filter((node) => node.selected)
    .slice(0, MAX_ITEMS)
    .map((node) => ({
      id: node.id,
      type: node.type,
      title: nodeTitle(node).slice(0, MAX_TITLE_CHARS),
    }));
}

/** The block appended to a message to attach `items`. */
export function selectionBlock(items: readonly SelectionItem[]): string {
  return `<${TAG}>${JSON.stringify({ items })}</${TAG}>`;
}

/**
 * Splits a message's text into what the person typed and the items attached
 * to it. The block may share a text part with the typed text, as it does in
 * the chat's optimistic copy of a just-sent message.
 */
export function extractSelection(text: string): {
  text: string;
  items: SelectionItem[];
} {
  const match = BLOCK_PATTERN.exec(text);
  if (!match) return { text, items: [] };
  let json: unknown;
  try {
    json = JSON.parse(match[1]);
  } catch {
    json = null;
  }
  const parsed = selectionSchema.safeParse(json);
  // Not ours after all; show the text as typed.
  if (!parsed.success) return { text, items: [] };
  return {
    text: text.replace(BLOCK_PATTERN, "\n").trim(),
    items: parsed.data.items,
  };
}
