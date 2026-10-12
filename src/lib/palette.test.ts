import sharp from "sharp";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
}));

vi.mock("@vercel/blob", () => ({ get: mocks.get }));

import {
  extractPaletteCandidates,
  loadPaletteImage,
  oklabToHex,
  rgbToOklab,
  scorePaletteHeuristically,
} from "./palette";

// A beige 100×100 image with a 20×20 terracotta square in the middle.
async function logoOnBeige(): Promise<Buffer> {
  const logo = await sharp({
    create: { width: 20, height: 20, channels: 3, background: "#C4643F" },
  })
    .png()
    .toBuffer();
  return sharp({
    create: { width: 100, height: 100, channels: 3, background: "#EDE6DA" },
  })
    .composite([{ input: logo, top: 40, left: 40 }])
    .png()
    .toBuffer();
}

function rgba(colors: [number, number, number, number][]): Uint8Array {
  return Uint8Array.from(colors.flat());
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("OKLab conversion", () => {
  it("round-trips sRGB colors", () => {
    for (const hex of ["#000000", "#FFFFFF", "#C4643F", "#3A5F8C"]) {
      const [r, g, b] = [1, 3, 5].map((i) =>
        Number.parseInt(hex.slice(i, i + 2), 16),
      );
      expect(oklabToHex(rgbToOklab(r, g, b))).toBe(hex);
    }
  });
});

describe("extractPaletteCandidates", () => {
  it("finds each distinct color with its share of the image", async () => {
    const { data } = await sharp(await logoOnBeige())
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    const candidates = extractPaletteCandidates(new Uint8Array(data));

    expect(candidates.map((c) => c.hex)).toEqual(["#EDE6DA", "#C4643F"]);
    expect(candidates[0].share).toBeCloseTo(0.96);
    expect(candidates[1].share).toBeCloseTo(0.04);
    expect(candidates[1].chroma).toBeGreaterThan(candidates[0].chroma);
  });

  it("ignores transparent pixels", () => {
    const candidates = extractPaletteCandidates(
      rgba([
        [255, 0, 0, 255],
        [0, 0, 255, 0],
      ]),
    );
    expect(candidates).toEqual([
      expect.objectContaining({ hex: "#FF0000", share: 1 }),
    ]);
  });

  it("merges colors too close to tell apart", () => {
    const candidates = extractPaletteCandidates(
      rgba([
        [200, 100, 60, 255],
        [201, 100, 60, 255],
        [0, 0, 0, 255],
      ]),
    );
    expect(candidates).toHaveLength(2);
    expect(candidates[0].share).toBeCloseTo(2 / 3);
  });

  it("drops the in-between colors where two colors meet", () => {
    const pixels: [number, number, number, number][] = [
      ...Array.from({ length: 60 }, (): [number, number, number, number] => [
        237, 230, 218, 255,
      ]),
      ...Array.from({ length: 38 }, (): [number, number, number, number] => [
        196, 100, 63, 255,
      ]),
      // Halfway between the beige and the terracotta.
      [216, 165, 140, 255],
      // A small navy accent that isn't between them.
      [31, 42, 68, 255],
    ];

    const candidates = extractPaletteCandidates(rgba(pixels));

    expect(candidates.map((c) => c.hex)).toEqual([
      "#EDE6DA",
      "#C4643F",
      "#1F2A44",
    ]);
  });

  it("returns nothing for a fully transparent image", () => {
    expect(extractPaletteCandidates(rgba([[0, 0, 0, 0]]))).toEqual([]);
  });
});

describe("scorePaletteHeuristically", () => {
  it("prefers a small vivid color over a large neutral one", () => {
    const colors = scorePaletteHeuristically([
      { hex: "#EDE6DA", share: 0.9, lightness: 0.93, chroma: 0.015 },
      { hex: "#C4643F", share: 0.06, lightness: 0.62, chroma: 0.13 },
      { hex: "#333333", share: 0.04, lightness: 0.32, chroma: 0 },
    ]);
    expect(colors.map((c) => c.role)).toEqual([
      "background",
      "primary",
      "neutral",
    ]);
    expect(colors[1].salience).toBe(1);
  });

  it("keeps strong secondary colors as accents and drops weak ones", () => {
    const colors = scorePaletteHeuristically([
      { hex: "#C4643F", share: 0.5, lightness: 0.62, chroma: 0.15 },
      { hex: "#3A5F8C", share: 0.4, lightness: 0.47, chroma: 0.15 },
      { hex: "#8C8C3A", share: 0.01, lightness: 0.6, chroma: 0.1 },
    ]);
    expect(colors.map((c) => c.role)).toEqual(["primary", "accent", "discard"]);
  });
});

describe("loadPaletteImage", () => {
  it("returns a small pixel sample and a JPEG preview", async () => {
    mocks.get.mockResolvedValue({
      stream: new Response(Uint8Array.from(await logoOnBeige())).body,
    });

    const image = await loadPaletteImage("private/image");

    expect(mocks.get).toHaveBeenCalledWith("private/image", {
      access: "private",
      useCache: false,
    });
    expect(image.pixels).toHaveLength(64 * 64 * 4);
    const preview = await sharp(image.preview).metadata();
    expect(preview.format).toBe("jpeg");
    expect(preview.width).toBe(100);
  });

  it("fails when the blob is missing", async () => {
    mocks.get.mockResolvedValue(null);
    await expect(loadPaletteImage("private/missing")).rejects.toThrow(
      "Image blob not found",
    );
  });
});
