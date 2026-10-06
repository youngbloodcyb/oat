import { z } from "zod";

/** One item the agent proposes to add to the board. */
export const boardAdditionSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("link"),
    url: z.url({ protocol: /^https?$/ }),
    title: z
      .string()
      .trim()
      .max(200)
      .optional()
      .describe("Shown on the approval card; the board fetches the preview."),
  }),
  z.object({
    type: z.literal("text"),
    text: z
      .string()
      .trim()
      .min(1)
      .max(10_000)
      .describe("Plain text. Blank lines separate paragraphs."),
  }),
]);

export const addToBoardSchema = z.object({
  boardId: z.string().min(1).describe("The board id from the page context."),
  items: z.array(boardAdditionSchema).min(1).max(12),
});

export type BoardAddition = z.infer<typeof boardAdditionSchema>;

/** Plain text to the HTML a text node stores. */
export function textToHtml(text: string): string {
  const escapeHtml = (value: string) =>
    value
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  return text
    .trim()
    .split(/\n\s*\n/)
    .map(
      (paragraph) => `<p>${escapeHtml(paragraph).replace(/\n/g, "<br>")}</p>`,
    )
    .join("");
}

const GAP = 40;
const COLUMNS = 4;

type Rect = { x: number; y: number; width: number; height: number };

/**
 * Where to put new nodes: a grid just right of everything on the board, so
 * nothing lands on top of what's already there.
 */
export function placeAdditions(
  existing: readonly Rect[],
  sizes: readonly { width: number; height: number }[],
): { x: number; y: number }[] {
  const left = existing.length
    ? Math.max(...existing.map((r) => r.x + r.width)) + GAP * 2
    : 0;
  const top = existing.length ? Math.min(...existing.map((r) => r.y)) : 0;
  const cellWidth = Math.max(...sizes.map((s) => s.width)) + GAP;
  const cellHeight = Math.max(...sizes.map((s) => s.height)) + GAP;
  return sizes.map((_, index) => ({
    x: left + (index % COLUMNS) * cellWidth,
    y: top + Math.floor(index / COLUMNS) * cellHeight,
  }));
}
