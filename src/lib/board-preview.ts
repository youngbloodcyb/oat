import type {
  ImageNodeData,
  LinkNodeData,
  NodeType,
  PdfNodeData,
  TextNodeData,
} from "@/db/schema";
import { DEFAULT_STYLE } from "@/lib/node-style";

/**
 * A stored node as the boards list loads it. The heavy fields (a PDF's
 * markdown, a text node's HTML) are left out of `data`; the text arrives
 * separately, truncated, in `text`.
 */
export type BoardPreviewRow = {
  id: string;
  boardId: string;
  type: NodeType;
  positionX: number;
  positionY: number;
  width: number | null;
  height: number | null;
  data:
    | LinkNodeData
    | Omit<TextNodeData, "text">
    | ImageNodeData
    | Omit<PdfNodeData, "markdown">;
  text: string | null;
};

/** Just enough of a node to draw it in a board thumbnail. */
export type BoardPreviewNode = {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  data:
    | {
        kind: "link";
        image?: string;
        icon?: string;
        themeColor?: string;
        hasTitle: boolean;
        hasDescription: boolean;
      }
    | { kind: "text"; paragraphs: string[] }
    | { kind: "image"; src: string; fit: "cover" | "contain" }
    | { kind: "pdf" };
};

export type ViewBox = { x: number; y: number; width: number; height: number };

// How many characters of a text node's HTML the boards list loads.
export const PREVIEW_TEXT_LENGTH = 2000;

// The most nodes a thumbnail draws, keeping the topmost.
export const PREVIEW_NODE_LIMIT = 100;

// Space kept around the nodes, and the smallest area a thumbnail covers, in
// board pixels. The minimum keeps a board with one small node from blowing
// that node up to fill the card.
const VIEW_PADDING = 32;
const MIN_VIEW = { width: 640, height: 360 };

// Approximates the text node's `p-3 text-sm` and the editor's paragraph
// spacing. Thumbnails are too small to read, so the text is drawn as bars.
export const TEXT_LAYOUT = {
  padding: 12,
  lineHeight: 22,
  charWidth: 7.5,
  paragraphGap: 16,
};

const HEX_COLOR = /^#[0-9a-f]{3,8}$/i;

export function toPreviewNode(row: BoardPreviewRow): BoardPreviewNode {
  const fallback = DEFAULT_STYLE[row.type];
  const base = {
    id: row.id,
    x: row.positionX,
    y: row.positionY,
    width: row.width ?? fallback.width,
    height: row.height ?? fallback.height,
  };
  const data = row.data;
  switch (data.kind) {
    case "link": {
      const og = data.og;
      return {
        ...base,
        data: {
          kind: "link",
          image: og?.image,
          icon: og?.icon,
          // Link data can be written by any editor, so don't trust it to be
          // the hex color the scraper stores before it lands in a style.
          themeColor:
            og?.themeColor && HEX_COLOR.test(og.themeColor)
              ? og.themeColor
              : undefined,
          hasTitle: !!og?.title,
          hasDescription: !!og?.description,
        },
      };
    }
    case "text":
      return {
        ...base,
        data: { kind: "text", paragraphs: htmlParagraphs(row.text ?? "") },
      };
    case "image":
      return {
        ...base,
        data: {
          kind: "image",
          src: data.objectKey ? `/api/files/${row.id}` : (data.url ?? ""),
          fit: data.fit ?? "cover",
        },
      };
    case "pdf":
      return { ...base, data: { kind: "pdf" } };
  }
}

/** Splits editor HTML into the plain text of each block. */
export function htmlParagraphs(html: string): string[] {
  return (
    html
      // A tag cut off by truncation.
      .replace(/<[^>]*$/, "")
      .split(/<\/(?:p|h[1-6]|li|blockquote|pre)>|<br\s*\/?>/i)
      .map((block) =>
        block
          .replace(/<[^>]*>/g, "")
          .replace(/&[a-z0-9#]+;/gi, " ")
          .replace(/\s+/g, " ")
          .trim(),
      )
      // Splitting on closing tags leaves an empty piece after the last one.
      .filter((block, i, all) => block || i < all.length - 1)
  );
}

/**
 * Lays out paragraphs as bars, one per wrapped line, positioned relative to
 * the node. Lines that would overflow the node are dropped, as the canvas
 * clips them.
 */
export function textLines(
  paragraphs: string[],
  width: number,
  height: number,
): { y: number; width: number }[] {
  const { padding, lineHeight, charWidth, paragraphGap } = TEXT_LAYOUT;
  const maxChars = Math.max(1, Math.floor((width - padding * 2) / charWidth));
  const lines: { y: number; width: number }[] = [];
  let y = padding;

  for (const [i, paragraph] of paragraphs.entries()) {
    if (i > 0) y += paragraphGap;
    for (const chars of wrap(paragraph, maxChars)) {
      if (y + lineHeight > height) return lines;
      if (chars > 0) lines.push({ y, width: chars * charWidth });
      y += lineHeight;
    }
  }
  return lines;
}

/** Greedy word wrap, returning each line's length in characters. */
function wrap(text: string, maxChars: number): number[] {
  if (!text) return [0];
  const lines: number[] = [];
  let line = 0;
  for (const word of text.split(" ")) {
    // Long words break mid-word, as `overflow-wrap` does on the canvas.
    let rest = word.length;
    if (line > 0 && line + 1 + rest > maxChars) {
      lines.push(line);
      line = 0;
    }
    if (line > 0) line += 1;
    while (line + rest > maxChars) {
      lines.push(maxChars);
      rest -= maxChars - line;
      line = 0;
    }
    line += rest;
  }
  lines.push(line);
  return lines;
}

/** The board area a thumbnail shows: every node, padded, centered. */
export function previewViewBox(nodes: BoardPreviewNode[]): ViewBox | null {
  if (nodes.length === 0) return null;
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const n of nodes) {
    minX = Math.min(minX, n.x);
    minY = Math.min(minY, n.y);
    maxX = Math.max(maxX, n.x + n.width);
    maxY = Math.max(maxY, n.y + n.height);
  }
  const width = Math.max(maxX - minX + VIEW_PADDING * 2, MIN_VIEW.width);
  const height = Math.max(maxY - minY + VIEW_PADDING * 2, MIN_VIEW.height);
  return {
    x: (minX + maxX - width) / 2,
    y: (minY + maxY - height) / 2,
    width,
    height,
  };
}
