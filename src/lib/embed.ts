/**
 * A link the board can play inline instead of showing as a card. Each
 * provider maps its URLs to a player; add new providers to `PROVIDERS`.
 */
export type Embed = {
  provider: "youtube";
  /** Player URL. It autoplays, since it's only mounted once play is pressed. */
  src: string;
  /** Poster shown until the player is mounted. */
  thumbnail: string;
  /** Width over height of the player. */
  aspectRatio: number;
};

const PROVIDERS: ((url: URL) => Embed | null)[] = [youtubeEmbed];

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
  const width = embed.aspectRatio < 1 ? 220 : 320;
  return {
    width,
    height: Math.round(width / embed.aspectRatio) + EMBED_STRIP_HEIGHT,
  };
}

const YOUTUBE_HOSTS = new Set([
  "youtube.com",
  "m.youtube.com",
  "music.youtube.com",
  "youtube-nocookie.com",
]);

const YOUTUBE_ID = /^[\w-]{11}$/;

function youtubeEmbed(url: URL): Embed | null {
  const host = url.hostname.replace(/^www\./, "");
  const segments = url.pathname.split("/").filter(Boolean);

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
  const start = parseYouTubeTime(
    url.searchParams.get("t") ?? url.searchParams.get("start"),
  );
  if (start) params.set("start", String(start));

  return {
    provider: "youtube",
    src: `https://www.youtube-nocookie.com/embed/${id}?${params}`,
    thumbnail: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
    aspectRatio: isShort ? 9 / 16 : 16 / 9,
  };
}

/** Reads a `t=` offset like "90", "90s" or "1h2m3s" as whole seconds. */
export function parseYouTubeTime(value: string | null): number | null {
  if (!value) return null;
  if (/^\d+$/.test(value)) return Number(value);
  const match = value.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/);
  if (!match || !match[0]) return null;
  const [, h = "0", m = "0", s = "0"] = match;
  return Number(h) * 3600 + Number(m) * 60 + Number(s);
}
