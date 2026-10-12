import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  decide: vi.fn(),
}));

vi.mock("ai", () => ({ experimental_decide: mocks.decide }));

import type { PaletteCandidate } from "./palette";
import {
  PALETTE_DECISION_MODEL,
  scorePaletteWithModel,
} from "./palette-decisions";

const candidates: PaletteCandidate[] = [
  { hex: "#EDE6DA", share: 0.9, lightness: 0.93, chroma: 0.015 },
  { hex: "#C4643F", share: 0.06, lightness: 0.62, chroma: 0.13 },
  { hex: "#3A5F8C", share: 0.04, lightness: 0.47, chroma: 0.1 },
];
const preview = new Uint8Array([1, 2, 3]);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("scorePaletteWithModel", () => {
  it("sends the image and candidates, and applies the model's roles", async () => {
    mocks.decide.mockResolvedValue({
      answers: {
        role_0: {
          type: "choice",
          choice: "background",
          probabilities: { background: 0.9, neutral: 0.1 },
        },
        role_1: {
          type: "choice",
          choice: "primary",
          probabilities: { primary: 0.8, accent: 0.2 },
        },
        role_2: { type: "choice", choice: "accent" },
      },
    });

    const colors = await scorePaletteWithModel({ candidates, preview });

    const call = mocks.decide.mock.calls[0][0];
    expect(call.model).toBe(PALETTE_DECISION_MODEL);
    expect(call.state[0].text).toContain("c2 #C4643F: covers 6% of the image");
    expect(call.state[1]).toEqual({
      type: "file",
      data: preview,
      mediaType: "image/jpeg",
    });
    expect(Object.keys(call.questions)).toEqual(["role_0", "role_1", "role_2"]);

    // Salience weights each role by the model's probability for it.
    expect(colors.map((c) => [c.hex, c.role])).toEqual([
      ["#EDE6DA", "background"],
      ["#C4643F", "primary"],
      ["#3A5F8C", "accent"],
    ]);
    expect(colors[0].salience).toBeCloseTo(0.025);
    expect(colors[1].salience).toBeCloseTo(0.95);
    expect(colors[2].salience).toBe(0.75);
    expect(colors[0].roleProbabilities).toEqual({
      background: 0.9,
      neutral: 0.1,
    });
  });

  it("keeps only the likeliest primary", async () => {
    mocks.decide.mockResolvedValue({
      answers: {
        role_0: { type: "choice", choice: "background" },
        role_1: {
          type: "choice",
          choice: "primary",
          probabilities: { primary: 0.6 },
        },
        role_2: {
          type: "choice",
          choice: "primary",
          probabilities: { primary: 0.8 },
        },
      },
    });

    const colors = await scorePaletteWithModel({ candidates, preview });

    expect(colors.map((c) => c.role)).toEqual([
      "background",
      "accent",
      "primary",
    ]);
  });

  it("promotes the likeliest primary when the model chose none", async () => {
    mocks.decide.mockResolvedValue({
      answers: {
        role_0: { type: "choice", choice: "background" },
        role_1: {
          type: "choice",
          choice: "accent",
          probabilities: { primary: 0.37, accent: 0.63 },
        },
        role_2: {
          type: "choice",
          choice: "accent",
          probabilities: { primary: 0.01, accent: 0.99 },
        },
      },
    });

    const colors = await scorePaletteWithModel({ candidates, preview });

    expect(colors.map((c) => c.role)).toEqual([
      "background",
      "primary",
      "accent",
    ]);
  });

  it("leaves the palette without a primary when no color is a likely one", async () => {
    mocks.decide.mockResolvedValue({
      answers: {
        role_0: { type: "choice", choice: "background" },
        role_1: {
          type: "choice",
          choice: "accent",
          probabilities: { primary: 0.1, accent: 0.9 },
        },
        role_2: { type: "choice", choice: "discard" },
      },
    });

    const colors = await scorePaletteWithModel({ candidates, preview });

    expect(colors.map((c) => c.role)).toEqual([
      "background",
      "accent",
      "discard",
    ]);
  });

  it("falls back to heuristic answers for refused questions", async () => {
    mocks.decide.mockResolvedValue({
      answers: {
        role_0: { type: "refusal" },
        role_1: { type: "refusal" },
        role_2: { type: "refusal" },
      },
    });

    const colors = await scorePaletteWithModel({ candidates, preview });

    expect(colors.map((c) => c.role)).toEqual([
      "background",
      "primary",
      "accent",
    ]);
    expect(colors[0].roleProbabilities).toBeUndefined();
  });
});
