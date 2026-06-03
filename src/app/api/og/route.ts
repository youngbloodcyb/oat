import type { NextRequest } from "next/server";
import type { OgMeta } from "@/lib/store";

const CACHE_TTL_MS = 60 * 60 * 1000;
const CACHE_MAX_ENTRIES = 200;
const FETCH_TIMEOUT_MS = 5000;
const MAX_BYTES = 1_000_000;

type CacheEntry = { data: OgMeta; expiresAt: number };
const cache = new Map<string, CacheEntry>();

const getCached = (key: string): OgMeta | null => {
  const entry = cache.get(key);
  if (!entry) return null;
  if (entry.expiresAt < Date.now()) {
    cache.delete(key);
    return null;
  }
  cache.delete(key);
  cache.set(key, entry);
  return entry.data;
};

const setCached = (key: string, data: OgMeta) => {
  if (cache.size >= CACHE_MAX_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest) cache.delete(oldest);
  }
  cache.set(key, { data, expiresAt: Date.now() + CACHE_TTL_MS });
};

const decodeEntities = (s: string) =>
  s
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ");

const parseMeta = (html: string, baseUrl: string): OgMeta => {
  const result: OgMeta = {};
  const setIfEmpty = (key: keyof OgMeta, value: string) => {
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
    }
  }

  if (!result.title) {
    const t = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    if (t) result.title = decodeEntities(t[1].trim());
  }

  if (result.image) {
    try {
      result.image = new URL(result.image, baseUrl).href;
    } catch {
      delete result.image;
    }
  }

  return result;
};

export async function GET(request: NextRequest) {
  const target = request.nextUrl.searchParams.get("url");
  if (!target) {
    return Response.json({ error: "missing url" }, { status: 400 });
  }

  let parsed: URL;
  try {
    parsed = new URL(target);
  } catch {
    return Response.json({ error: "invalid url" }, { status: 400 });
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return Response.json({ error: "unsupported protocol" }, { status: 400 });
  }

  const cached = getCached(parsed.href);
  if (cached) {
    return Response.json(cached, {
      headers: { "x-og-cache": "hit" },
    });
  }

  try {
    const res = await fetch(parsed.href, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; OatOGFetcher/1.0; +https://localhost)",
        Accept: "text/html,application/xhtml+xml",
      },
      redirect: "follow",
    });

    if (!res.ok || !res.body) {
      return Response.json(
        { error: `upstream ${res.status}` },
        { status: 502 },
      );
    }
    const contentType = res.headers.get("content-type") ?? "";
    if (!contentType.includes("html")) {
      return Response.json({ error: "not html" }, { status: 415 });
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let html = "";
    let bytes = 0;
    while (bytes < MAX_BYTES) {
      const { value, done } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      html += decoder.decode(value, { stream: true });
      if (html.includes("</head>")) break;
    }
    reader.cancel().catch(() => {});

    const meta = parseMeta(html, res.url || parsed.href);
    setCached(parsed.href, meta);
    return Response.json(meta, { headers: { "x-og-cache": "miss" } });
  } catch (err) {
    const message = err instanceof Error ? err.message : "fetch failed";
    return Response.json({ error: message }, { status: 502 });
  }
}
