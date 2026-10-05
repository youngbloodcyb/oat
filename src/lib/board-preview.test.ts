import { describe, expect, it } from "vitest";
import {
  type BoardPreviewNode,
  type BoardPreviewRow,
  htmlParagraphs,
  previewViewBox,
  TEXT_LAYOUT,
  textLines,
  toPreviewNode,
} from "./board-preview";

const row = (overrides: Partial<BoardPreviewRow>): BoardPreviewRow => ({
  id: "node-1",
  boardId: "board-1",
  type: "text",
  positionX: 10,
  positionY: 20,
  width: 300,
  height: 200,
  data: { kind: "text" },
  text: null,
  ...overrides,
});

const node = (
  x: number,
  y: number,
  width: number,
  height: number,
): BoardPreviewNode => ({
  id: `${x},${y}`,
  x,
  y,
  width,
  height,
  data: { kind: "pdf" },
});

describe("toPreviewNode", () => {
  it("falls back to the kind's default size", () => {
    const result = toPreviewNode(
      row({
        type: "pdf",
        width: null,
        height: null,
        data: { kind: "pdf", name: "a.pdf" },
      }),
    );
    expect(result).toMatchObject({ x: 10, y: 20, width: 320, height: 400 });
  });

  it("serves uploaded images through the files route", () => {
    const result = toPreviewNode(
      row({ type: "image", data: { kind: "image", objectKey: "k" } }),
    );
    expect(result.data).toEqual({
      kind: "image",
      src: "/api/files/node-1",
      fit: "cover",
    });
  });

  it("uses an external image's url directly", () => {
    const result = toPreviewNode(
      row({
        type: "image",
        data: { kind: "image", url: "https://x.test/a.png", fit: "contain" },
      }),
    );
    expect(result.data).toEqual({
      kind: "image",
      src: "https://x.test/a.png",
      fit: "contain",
    });
  });

  it("keeps a link's preview fields", () => {
    const result = toPreviewNode(
      row({
        type: "link",
        data: {
          kind: "link",
          url: "https://x.test",
          og: {
            title: "T",
            icon: "https://x.test/i.png",
            themeColor: "#ff0000",
          },
        },
      }),
    );
    expect(result.data).toEqual({
      kind: "link",
      image: undefined,
      icon: "https://x.test/i.png",
      themeColor: "#ff0000",
      hasTitle: true,
      hasDescription: false,
    });
  });

  it("drops a theme color that isn't a hex color", () => {
    const result = toPreviewNode(
      row({
        type: "link",
        data: {
          kind: "link",
          url: "https://x.test",
          og: { themeColor: "red; background: url(https://evil.test)" },
        },
      }),
    );
    expect(result.data).toMatchObject({ themeColor: undefined });
  });

  it("splits a text node's HTML into paragraphs", () => {
    const result = toPreviewNode(row({ text: "<p>One</p><p>Two</p>" }));
    expect(result.data).toEqual({ kind: "text", paragraphs: ["One", "Two"] });
  });
});

describe("htmlParagraphs", () => {
  it("keeps empty paragraphs but not the trailing split", () => {
    expect(htmlParagraphs("<p>a</p><p></p><h2>b <em>c</em></h2>")).toEqual([
      "a",
      "",
      "b c",
    ]);
  });

  it("splits on line breaks", () => {
    expect(htmlParagraphs("<p>a<br>b</p>")).toEqual(["a", "b"]);
  });

  it("ignores a tag cut off by truncation", () => {
    expect(htmlParagraphs("<p>a</p><p cla")).toEqual(["a"]);
  });

  it("returns nothing for empty text", () => {
    expect(htmlParagraphs("")).toEqual([]);
  });
});

describe("textLines", () => {
  const { padding, lineHeight, charWidth, paragraphGap } = TEXT_LAYOUT;
  // Fits exactly ten characters per line.
  const width = padding * 2 + charWidth * 10;

  it("wraps at word boundaries", () => {
    const lines = textLines(["aaaa bbbb cccc"], width, 1000);
    expect(lines).toEqual([
      { y: padding, width: 9 * charWidth },
      { y: padding + lineHeight, width: 4 * charWidth },
    ]);
  });

  it("breaks words longer than a line", () => {
    const lines = textLines(["a".repeat(25)], width, 1000);
    expect(lines.map((l) => l.width / charWidth)).toEqual([10, 10, 5]);
  });

  it("leaves a gap for empty paragraphs", () => {
    const lines = textLines(["a", "", "b"], width, 1000);
    expect(lines.map((l) => l.y)).toEqual([
      padding,
      padding + 2 * lineHeight + 2 * paragraphGap,
    ]);
  });

  it("drops lines that overflow the node", () => {
    const lines = textLines(
      ["a b c d e f g h i j k"],
      30,
      padding + lineHeight * 2,
    );
    expect(lines).toHaveLength(2);
  });
});

describe("previewViewBox", () => {
  it("returns null for an empty board", () => {
    expect(previewViewBox([])).toBeNull();
  });

  it("centers small boards in the minimum area", () => {
    expect(previewViewBox([node(0, 0, 100, 100)])).toEqual({
      x: -270,
      y: -130,
      width: 640,
      height: 360,
    });
  });

  it("pads the bounds of large boards", () => {
    expect(
      previewViewBox([node(0, 0, 100, 100), node(1900, 1000, 100, 100)]),
    ).toEqual({ x: -32, y: -32, width: 2064, height: 1164 });
  });
});
