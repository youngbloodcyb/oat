import type { NodeType } from "@/db/schema";

// Default footprint per node kind, applied at creation time. Kept out of the
// client store so server code can size nodes stored without dimensions.
export const DEFAULT_STYLE: Record<
  NodeType,
  { width: number; height: number }
> = {
  link: { width: 256, height: 280 },
  text: { width: 220, height: 120 },
  image: { width: 240, height: 240 },
  pdf: { width: 320, height: 400 },
};
