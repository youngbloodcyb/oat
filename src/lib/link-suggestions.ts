import { z } from "zod";

const httpUrl = z.url({ protocol: /^https?$/ });

/** One link the agent offers to add to the board, e.g. a product it found. */
export const linkSuggestionSchema = z.object({
  url: httpUrl,
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(300).optional(),
  image: httpUrl.optional(),
  price: z.string().trim().max(40).optional(),
  source: z.string().trim().max(80).optional(),
});

export const linkSuggestionsSchema = z.object({
  links: z.array(linkSuggestionSchema).min(1).max(12),
});

export type LinkSuggestion = z.infer<typeof linkSuggestionSchema>;
