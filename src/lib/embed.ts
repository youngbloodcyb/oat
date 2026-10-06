/**
 * A link the board can play inline instead of showing as a card. Each
 * provider maps its URLs to a player; add new providers to `PROVIDERS`.
 */
export type Embed = {
  provider: "youtube" | "vimeo" | "loom" | "spotify" | "video";
  /** A provider's player page, or a media file played natively. */
  player: "iframe" | "video";
  src: string;
  /**
   * "poster" shows a thumbnail until play is pressed, keeping heavy players
   * off a board until someone wants them; "eager" mounts the player at once.
   */
  load: "poster" | "eager";
  /** Poster image. Without one, the link's OG image stands in. */
  thumbnail?: string;
  /** Video players keep an aspect ratio; audio players have a set height. */
  size: { aspectRatio: number } | { height: number };
};

const PROVIDERS: ((url: URL) => Embed | null)[] = [
  youtubeEmbed,
  vimeoEmbed,
  loomEmbed,
  spotifyEmbed,
  videoFileEmbed,
];

export function parseEmbed(url: string): Embed | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  for (const provider of PROVIDERS) {
    const embed = provider(parsed);
    if (embed) return embed;
  }
  return null;
}

// Height of the title strip under an embed's player, which doubles as the
// node's drag handle once the player is swallowing pointer events.
export const EMBED_STRIP_HEIGHT = 64;

/** Default footprint for a new link node that plays inline. */
export function embedNodeSize(embed: Embed): { width: number; height: number } {
  if ("height" in embed.size) {
    return { width: 320, height: embed.size.height + EMBED_STRIP_HEIGHT };
  }
  const { aspectRatio } = embed.size;
  const width = aspectRatio < 1 ? 220 : 320;
  return {
    width,
    height: Math.round(width / aspectRatio) + EMBED_STRIP_HEIGHT,
  };
}

const WIDESCREEN = { aspectRatio: 16 / 9 };

const hostOf = (url: URL) => url.hostname.replace(/^www\./, "");
const segmentsOf = (url: URL) => url.pathname.split("/").filter(Boolean);

const YOUTUBE_HOSTS = new Set([
  "youtube.com",
  "m.youtube.com",
  "music.youtube.com",
  "youtube-nocookie.com",
]);

const YOUTUBE_ID = /^[\w-]{11}$/;

function youtubeEmbed(url: URL): Embed | null {
  const host = hostOf(url);
  const segments = segmentsOf(url);

  let id: string | null = null;
  let isShort = false;
  if (host === "youtu.be") {
    id = segments[0] ?? null;
  } else if (YOUTUBE_HOSTS.has(host)) {
    if (segments[0] === "watch") {
      id = url.searchParams.get("v");
    } else if (["shorts", "live", "embed", "v"].includes(segments[0])) {
      id = segments[1] ?? null;
      isShort = segments[0] === "shorts";
    }
  }
  if (!id || !YOUTUBE_ID.test(id)) return null;

  const params = new URLSearchParams({ autoplay: "1", rel: "0" });
  const start = parseTimestamp(
    url.searchParams.get("t") ?? url.searchParams.get("start"),
  );
  if (start) params.set("start", String(start));

  return {
    provider: "youtube",
    player: "iframe",
    src: `https://www.youtube-nocookie.com/embed/${id}?${params}`,
    load: "poster",
    thumbnail: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
    size: isShort ? { aspectRatio: 9 / 16 } : WIDESCREEN,
  };
}

function vimeoEmbed(url: URL): Embed | null {
  const host = hostOf(url);
  const segments = segmentsOf(url);

  let id: string | undefined;
  let hash: string | undefined;
  if (host === "player.vimeo.com" && segments[0] === "video") {
    id = segments[1];
    hash = url.searchParams.get("h") ?? undefined;
  } else if (host === "vimeo.com") {
    // The id is the first numeric segment, which also covers
    // /channels/<name>/<id> and /groups/<name>/videos/<id>. An unlisted
    // video's privacy hash is the segment after it.
    const index = segments.findIndex((segment) => /^\d+$/.test(segment));
    id = segments[index];
    hash = segments[index + 1]?.match(/^[\da-f]+$/i)?.[0];
  }
  if (!id || !/^\d+$/.test(id)) return null;

  const params = new URLSearchParams({ autoplay: "1", dnt: "1" });
  if (hash) params.set("h", hash);
  const start = parseTimestamp(new URLSearchParams(url.hash.slice(1)).get("t"));

  return {
    provider: "vimeo",
    player: "iframe",
    src: `https://player.vimeo.com/video/${id}?${params}${start ? `#t=${start}s` : ""}`,
    load: "poster",
    size: WIDESCREEN,
  };
}

function loomEmbed(url: URL): Embed | null {
  if (hostOf(url) !== "loom.com") return null;
  const [kind, id] = segmentsOf(url);
  if ((kind !== "share" && kind !== "embed") || !id) return null;
  // Share links can lead with a title slug: /share/<slug>-<id>.
  const match = id.match(/[\da-f]{32}$/i);
  if (!match) return null;

  return {
    provider: "loom",
    player: "iframe",
    src: `https://www.loom.com/embed/${match[0]}?autoplay=1`,
    load: "poster",
    size: WIDESCREEN,
  };
}

// Single tracks and episodes get Spotify's compact player; everything else
// lists its contents, which needs the taller one.
const SPOTIFY_HEIGHTS: Record<string, number> = {
  track: 152,
  episode: 152,
  album: 352,
  playlist: 352,
  show: 352,
  artist: 352,
};

function spotifyEmbed(url: URL): Embed | null {
  if (hostOf(url) !== "open.spotify.com") return null;
  // Localized links lead with a locale: /intl-de/track/<id>.
  const segments = segmentsOf(url).filter((s) => !s.startsWith("intl-"));
  if (segments[0] === "embed") segments.shift();
  const [type, id] = segments;
  const height = SPOTIFY_HEIGHTS[type];
  if (!height || !id || !/^[\dA-Za-z]{22}$/.test(id)) return null;

  return {
    provider: "spotify",
    player: "iframe",
    src: `https://open.spotify.com/embed/${type}/${id}`,
    load: "eager",
    size: { height },
  };
}

const VIDEO_FILE = /\.(mp4|m4v|webm|ogv|mov)$/i;

function videoFileEmbed(url: URL): Embed | null {
  if (!VIDEO_FILE.test(url.pathname)) return null;
  return {
    provider: "video",
    player: "video",
    src: url.href,
    load: "eager",
    size: WIDESCREEN,
  };
}

/** Reads a timestamp like "90", "90s" or "1h2m3s" as whole seconds. */
export function parseTimestamp(value: string | null): number | null {
  if (!value) return null;
  if (/^\d+$/.test(value)) return Number(value);
  const match = value.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/);
  if (!match || !match[0]) return null;
  const [, h = "0", m = "0", s = "0"] = match;
  return Number(h) * 3600 + Number(m) * 60 + Number(s);
}
