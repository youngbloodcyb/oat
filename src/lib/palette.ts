import { get } from "@vercel/blob";
import sharp from "sharp";

export const PALETTE_ROLES = [
  "primary",
  "accent",
  "neutral",
  "background",
  "discard",
] as const;

export type PaletteRole = (typeof PALETTE_ROLES)[number];

/** A representative color from an image, before any role is assigned. */
export type PaletteCandidate = {
  hex: string;
  /** Fraction of the image's opaque pixels closest to this color. */
  share: number;
  /** OKLab lightness, 0–1. */
  lightness: number;
  /** OKLab chroma; roughly 0 for grays, above ~0.1 for vivid colors. */
  chroma: number;
};

export type PaletteColor = PaletteCandidate & {
  role: PaletteRole;
  /** How brand-defining the color is, 0–1. */
  salience: number;
  /** The model's distribution over roles, absent for heuristic palettes. */
  roleProbabilities?: Partial<Record<PaletteRole, number>>;
};

export type Palette = {
  scoredBy: "model" | "heuristic";
  colors: PaletteColor[];
};

// Clustering runs on a small copy: palettes don't need detail, and 64×64
// keeps k-means well under a millisecond per iteration.
const SAMPLE_DIMENSION = 64;
// The image the decision model looks at.
const PREVIEW_DIMENSION = 512;
const CLUSTER_COUNT = 10;
const ITERATIONS = 20;
// OKLab distance under which two clusters read as the same color.
const MERGE_DISTANCE = 0.04;
const MIN_SHARE = 0.005;
// Downscaling and compression average the pixels where two colors meet,
// leaving thin bands of in-between colors. A small cluster within this OKLab
// distance of the line between two larger ones is one of those bands.
const BLEND_MAX_SHARE = 0.03;
const BLEND_DISTANCE = 0.03;
const NEUTRAL_CHROMA = 0.04;

export type PaletteImage = {
  /** RGBA pixels of the downscaled sample. */
  pixels: Uint8Array;
  /** JPEG shown to the decision model. */
  preview: Uint8Array;
};

export async function loadPaletteImage(
  objectKey: string,
): Promise<PaletteImage> {
  const result = await get(objectKey, { access: "private", useCache: false });
  if (!result?.stream) throw new Error("Image blob not found");

  const source = Buffer.from(await new Response(result.stream).arrayBuffer());
  const image = () => sharp(source, { animated: false }).rotate();

  const [pixels, preview] = await Promise.all([
    image()
      .resize({
        width: SAMPLE_DIMENSION,
        height: SAMPLE_DIMENSION,
        fit: "inside",
      })
      .ensureAlpha()
      .raw()
      .toBuffer(),
    image()
      .resize({
        width: PREVIEW_DIMENSION,
        height: PREVIEW_DIMENSION,
        fit: "inside",
        withoutEnlargement: true,
      })
      .flatten({ background: "#ffffff" })
      .jpeg({ quality: 85 })
      .toBuffer(),
  ]);
  return { pixels: new Uint8Array(pixels), preview: new Uint8Array(preview) };
}

type Lab = [number, number, number];

function toLinear(channel: number): number {
  const c = channel / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function fromLinear(value: number): number {
  const c =
    value <= 0.0031308 ? value * 12.92 : 1.055 * value ** (1 / 2.4) - 0.055;
  return Math.round(Math.min(1, Math.max(0, c)) * 255);
}

export function rgbToOklab(r: number, g: number, b: number): Lab {
  const lr = toLinear(r);
  const lg = toLinear(g);
  const lb = toLinear(b);
  const l = Math.cbrt(
    0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb,
  );
  const m = Math.cbrt(
    0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb,
  );
  const s = Math.cbrt(
    0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb,
  );
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

export function oklabToHex([L, a, b]: Lab): string {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const rgb = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
  return `#${rgb
    .map((v) => fromLinear(v).toString(16).padStart(2, "0"))
    .join("")}`.toUpperCase();
}

function distanceSquared(x: Lab, y: Lab): number {
  return (x[0] - y[0]) ** 2 + (x[1] - y[1]) ** 2 + (x[2] - y[2]) ** 2;
}

// k-means++ seeding with a fixed-seed generator, so the same image always
// yields the same palette.
function seedCentroids(points: Lab[], k: number): Lab[] {
  let seed = 1;
  const random = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };

  const centroids: Lab[] = [points[Math.floor(random() * points.length)]];
  const nearest = points.map((p) => distanceSquared(p, centroids[0]));
  while (centroids.length < k) {
    const total = nearest.reduce((sum, d) => sum + d, 0);
    if (total === 0) break;
    let target = random() * total;
    let index = 0;
    while (index < points.length - 1 && target > nearest[index]) {
      target -= nearest[index];
      index += 1;
    }
    const next = points[index];
    centroids.push(next);
    for (let i = 0; i < points.length; i += 1) {
      nearest[i] = Math.min(nearest[i], distanceSquared(points[i], next));
    }
  }
  return centroids;
}

function cluster(points: Lab[], k: number): { center: Lab; count: number }[] {
  let centroids = seedCentroids(points, k);
  const assignment = new Array<number>(points.length).fill(0);

  for (let iteration = 0; iteration < ITERATIONS; iteration += 1) {
    let changed = false;
    for (let i = 0; i < points.length; i += 1) {
      let best = 0;
      let bestDistance = Number.POSITIVE_INFINITY;
      for (let c = 0; c < centroids.length; c += 1) {
        const d = distanceSquared(points[i], centroids[c]);
        if (d < bestDistance) {
          bestDistance = d;
          best = c;
        }
      }
      if (assignment[i] !== best) changed = true;
      assignment[i] = best;
    }

    const sums = centroids.map(() => [0, 0, 0, 0]);
    for (let i = 0; i < points.length; i += 1) {
      const sum = sums[assignment[i]];
      sum[0] += points[i][0];
      sum[1] += points[i][1];
      sum[2] += points[i][2];
      sum[3] += 1;
    }
    centroids = sums.map((sum, c) =>
      sum[3] === 0
        ? centroids[c]
        : [sum[0] / sum[3], sum[1] / sum[3], sum[2] / sum[3]],
    );
    if (!changed && iteration > 0) break;
  }

  const counts = centroids.map(() => 0);
  for (const index of assignment) counts[index] += 1;
  return centroids.map((center, c) => ({ center, count: counts[c] }));
}

// Folds clusters that are perceptually the same color into the larger one.
function mergeSimilar(
  clusters: { center: Lab; count: number }[],
): { center: Lab; count: number }[] {
  const merged: { center: Lab; count: number }[] = [];
  for (const next of [...clusters].sort((x, y) => y.count - x.count)) {
    const match = merged.find(
      (m) => distanceSquared(m.center, next.center) < MERGE_DISTANCE ** 2,
    );
    if (!match) {
      merged.push({ center: [...next.center], count: next.count });
      continue;
    }
    const total = match.count + next.count;
    match.center = match.center.map(
      (v, i) => (v * match.count + next.center[i] * next.count) / total,
    ) as Lab;
    match.count = total;
  }
  return merged;
}

// How far `point` is from the segment between `from` and `to`, and where
// along it (0 at `from`, 1 at `to`) the nearest point falls.
function segmentDistance(
  point: Lab,
  from: Lab,
  to: Lab,
): { distance: number; t: number } {
  const direction = to.map((v, i) => v - from[i]) as Lab;
  const length = distanceSquared(to, from);
  const t =
    length === 0
      ? 0
      : direction.reduce((sum, v, i) => sum + v * (point[i] - from[i]), 0) /
        length;
  const clamped = Math.min(1, Math.max(0, t));
  const nearest = from.map((v, i) => v + direction[i] * clamped) as Lab;
  return { distance: Math.sqrt(distanceSquared(point, nearest)), t };
}

function isBlend(
  candidate: { center: Lab; count: number },
  clusters: { center: Lab; count: number }[],
  total: number,
): boolean {
  if (candidate.count / total >= BLEND_MAX_SHARE) return false;
  const larger = clusters.filter((c) => c.count > candidate.count);
  for (let i = 0; i < larger.length; i += 1) {
    for (let j = i + 1; j < larger.length; j += 1) {
      const { distance, t } = segmentDistance(
        candidate.center,
        larger[i].center,
        larger[j].center,
      );
      if (distance < BLEND_DISTANCE && t > 0.05 && t < 0.95) return true;
    }
  }
  return false;
}

/**
 * Representative colors of an RGBA image, most common first. Transparent
 * pixels and the in-between colors at edges are ignored.
 */
export function extractPaletteCandidates(
  pixels: Uint8Array,
): PaletteCandidate[] {
  const points: Lab[] = [];
  for (let i = 0; i + 3 < pixels.length; i += 4) {
    if (pixels[i + 3] < 128) continue;
    points.push(rgbToOklab(pixels[i], pixels[i + 1], pixels[i + 2]));
  }
  if (points.length === 0) return [];

  const clusters = mergeSimilar(
    cluster(points, Math.min(CLUSTER_COUNT, points.length)),
  );
  return clusters
    .filter((c) => !isBlend(c, clusters, points.length))
    .map(({ center, count }) => ({
      hex: oklabToHex(center),
      share: count / points.length,
      lightness: center[0],
      chroma: Math.hypot(center[1], center[2]),
    }))
    .filter((c) => c.share >= MIN_SHARE)
    .sort((x, y) => y.share - x.share);
}

/**
 * Assigns roles without a model: vivid colors are weighted up so a small
 * logo can outrank a large wall, and large grays are treated as background.
 */
export function scorePaletteHeuristically(
  candidates: PaletteCandidate[],
): PaletteColor[] {
  const scored = candidates.map((c) => {
    const neutral = c.chroma < NEUTRAL_CHROMA;
    const vividness = neutral ? 0.1 : Math.min(1, c.chroma / 0.15);
    return { candidate: c, neutral, salience: Math.sqrt(c.share) * vividness };
  });
  const top = Math.max(0, ...scored.map((s) => s.salience));
  const chromatic = scored
    .filter((s) => !s.neutral)
    .sort((x, y) => y.salience - x.salience);

  return scored.map(({ candidate, neutral, salience }) => {
    let role: PaletteRole;
    if (neutral) role = candidate.share >= 0.3 ? "background" : "neutral";
    else if (chromatic[0]?.candidate === candidate) role = "primary";
    else role = salience >= top * 0.5 ? "accent" : "discard";
    return {
      ...candidate,
      role,
      salience: top === 0 ? 0 : salience / top,
    };
  });
}
