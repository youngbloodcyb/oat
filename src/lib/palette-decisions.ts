import {
  type Experimental_DecisionQuestion as DecisionQuestion,
  experimental_decide as decide,
} from "ai";
import {
  PALETTE_ROLES,
  type PaletteCandidate,
  type PaletteColor,
  type PaletteRole,
  scorePaletteHeuristically,
} from "@/lib/palette";

export const PALETTE_DECISION_MODEL = "openai/gpt-6-luna-decisions";

const ROLE_CRITERIA: Record<PaletteRole, string> = {
  primary:
    "The main brand color: what the image's subject, logo or product is most recognizably colored.",
  accent:
    "A distinctive secondary color worth keeping in a brand palette, even if it covers little of the image.",
  neutral:
    "A white, black, gray or muted tone useful for text or surfaces in a brand palette.",
  background:
    "Part of the backdrop, floor, sky or setting rather than the subject itself.",
  discard:
    "Noise, a shadow, a highlight or an incidental color that doesn't belong in a brand palette.",
};

const MIN_PRIMARY_PROBABILITY = 0.2;

// How brand-defining each role is. A color's salience is this weighted by
// the model's probabilities, so a confident primary scores near 1 and an
// uncertain one lower.
const ROLE_SALIENCE: Record<PaletteRole, number> = {
  primary: 1,
  accent: 0.75,
  neutral: 0.25,
  background: 0,
  discard: 0,
};

function questionsFor(
  candidates: PaletteCandidate[],
): Record<string, DecisionQuestion> {
  const questions: Record<string, DecisionQuestion> = {};
  candidates.forEach((candidate, index) => {
    const label = `c${index + 1} (${candidate.hex})`;
    questions[`role_${index}`] = {
      type: "choice",
      instructions: `Which role should color ${label} play in a brand palette drawn from this image?`,
      criteria: ROLE_CRITERIA,
    };
  });
  return questions;
}

function isRole(value: string): value is PaletteRole {
  return (PALETTE_ROLES as readonly string[]).includes(value);
}

function salienceOf(
  role: PaletteRole,
  probabilities: Partial<Record<PaletteRole, number>> | undefined,
): number {
  if (!probabilities) return ROLE_SALIENCE[role];
  return PALETTE_ROLES.reduce(
    (sum, r) => sum + (probabilities[r] ?? 0) * ROLE_SALIENCE[r],
    0,
  );
}

/**
 * Asks the decision model which role each candidate plays, given the image.
 * Questions the model refuses keep their heuristic answer.
 */
export async function scorePaletteWithModel(input: {
  candidates: PaletteCandidate[];
  preview: Uint8Array;
}): Promise<PaletteColor[]> {
  const { candidates } = input;
  const fallback = scorePaletteHeuristically(candidates);
  const list = candidates
    .map(
      (c, index) =>
        `c${index + 1} ${c.hex}: covers ${Math.round(c.share * 100)}% of the image`,
    )
    .join("\n");

  const result = await decide({
    model: PALETTE_DECISION_MODEL,
    state: [
      {
        type: "text",
        text: `We're building a brand palette from this image. Colors extracted from it, most common first:\n${list}`,
      },
      { type: "file", data: input.preview, mediaType: "image/jpeg" },
    ],
    questions: questionsFor(candidates),
  });

  const colors = candidates.map((_, index): PaletteColor => {
    const role = result.answers[`role_${index}`];
    const color: PaletteColor = { ...fallback[index] };
    if (role?.type === "choice" && isRole(role.choice)) {
      color.role = role.choice;
      if (role.probabilities) color.roleProbabilities = role.probabilities;
      color.salience = salienceOf(role.choice, role.probabilities);
    }
    return color;
  });

  // Each question is answered independently, so any number of colors can
  // come back as primary. Keep exactly one: the likeliest of those chosen,
  // or, when none was, the likeliest candidate if the model gave it a
  // reasonable chance.
  const primaryProbability = (c: PaletteColor) =>
    c.roleProbabilities?.primary ?? 0;
  const likeliest = (pool: PaletteColor[]) =>
    pool.reduce<PaletteColor | undefined>(
      (best, c) =>
        !best || primaryProbability(c) > primaryProbability(best) ? c : best,
      undefined,
    );
  const primaries = colors.filter((c) => c.role === "primary");
  if (primaries.length === 0) {
    const promoted = likeliest(colors);
    if (promoted && primaryProbability(promoted) >= MIN_PRIMARY_PROBABILITY) {
      promoted.role = "primary";
    }
  } else {
    const kept = likeliest(primaries);
    for (const color of primaries) {
      if (color !== kept) color.role = "accent";
    }
  }
  return colors;
}
