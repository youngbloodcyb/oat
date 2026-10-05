import type { OpenGraph } from "@/db/schema";

const decodeEntities = (s: string) =>
  s
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ");

const HEX_COLOR = /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

/** Resolves a possibly relative URL, keeping only http(s) results. */
function resolveHttpUrl(value: string, baseUrl: string): string | undefined {
  try {
    const url = new URL(value, baseUrl);
    return url.protocol === "http:" || url.protocol === "https:"
      ? url.href
      : undefined;
  } catch {
    return undefined;
  }
}

/** Picks the best site icon: apple-touch-icon is usually largest. */
function parseIcon(html: string, baseUrl: string): string | undefined {
  let icon: string | undefined;
  let touchIcon: string | undefined;
  for (const m of html.matchAll(/<link\b[^>]*>/gi)) {
    const tag = m[0];
    const rel = tag.match(/rel\s*=\s*["']([^"']+)["']/i)?.[1]?.toLowerCase();
    const href = tag.match(/href\s*=\s*["']([^"']+)["']/i)?.[1];
    if (!rel || !href) continue;
    const rels = rel.split(/\s+/);
    if (rels.includes("apple-touch-icon")) touchIcon ??= decodeEntities(href);
    else if (rels.includes("icon")) icon ??= decodeEntities(href);
  }
  return resolveHttpUrl(touchIcon ?? icon ?? "/favicon.ico", baseUrl);
}

export function parseMeta(html: string, baseUrl: string): OpenGraph {
  const result: OpenGraph = {};
  const setIfEmpty = (key: keyof OpenGraph, value: string) => {
    if (!result[key]) result[key] = value;
  };

  for (const m of html.matchAll(/<meta\b[^>]*>/gi)) {
    const tag = m[0];
    const prop = tag
      .match(/(?:property|name)\s*=\s*["']([^"']+)["']/i)?.[1]
      ?.toLowerCase();
    const content = tag.match(/content\s*=\s*["']([^"']*)["']/i)?.[1];
    if (!prop || !content) continue;
    const decoded = decodeEntities(content).trim();
    if (!decoded) continue;

    switch (prop) {
      case "og:title":
      case "twitter:title":
        setIfEmpty("title", decoded);
        break;
      case "og:description":
      case "twitter:description":
      case "description":
        setIfEmpty("description", decoded);
        break;
      case "og:image":
      case "og:image:url":
      case "twitter:image":
        setIfEmpty("image", decoded);
        break;
      case "og:site_name":
        setIfEmpty("siteName", decoded);
        break;
      case "theme-color":
        // Only plain hex colors, since the value is used in inline styles.
        if (HEX_COLOR.test(decoded)) setIfEmpty("themeColor", decoded);
        break;
    }
  }

  if (!result.title) {
    const t = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    if (t) result.title = decodeEntities(t[1].trim());
  }

  if (result.image) {
    const image = resolveHttpUrl(result.image, baseUrl);
    if (image) result.image = image;
    else delete result.image;
  }

  const icon = parseIcon(html, baseUrl);
  if (icon) result.icon = icon;

  return result;
}
