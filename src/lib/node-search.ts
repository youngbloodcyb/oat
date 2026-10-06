import type { NodeData } from "@/db/schema";

export function normalizeText(value: string): string {
  return value
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function nodeSearchText(data: NodeData): string {
  switch (data.kind) {
    case "text":
      return normalizeText(data.text);
    case "link":
      return normalizeText(
        [data.og?.title, data.og?.description, data.og?.siteName, data.url]
          .filter(Boolean)
          .join(" "),
      );
    case "image":
      return normalizeText(data.alt ?? "");
    case "pdf":
      return normalizeText(
        [data.name, data.markdown].filter(Boolean).join(" "),
      );
  }
}

export function nodeSearchTitle(data: NodeData, searchText: string): string {
  switch (data.kind) {
    case "link":
      return data.og?.title?.trim() || data.url;
    case "pdf":
      return data.name;
    case "image":
      return data.alt?.trim() || "Image";
    case "text":
      return searchText.slice(0, 80) || "Untitled text";
  }
}
