import { describe, expect, it } from "vitest";
import { embedNodeSize, parseEmbed, parseTimestamp } from "./embed";

const YOUTUBE_ID = "dQw4w9WgXcQ";
const LOOM_ID = "0281766fa2d04bb788eaf19e65135184";
const SPOTIFY_ID = "4cOdK2wGLETKBW3PvgPWqT";

const embedOf = (url: string) => {
  const embed = parseEmbed(url);
  if (!embed) throw new Error(`expected an embed for ${url}`);
  return embed;
};

describe("youtube", () => {
  it.each([
    `https://www.youtube.com/watch?v=${YOUTUBE_ID}`,
    `https://youtube.com/watch?v=${YOUTUBE_ID}&list=PL123`,
    `https://m.youtube.com/watch?v=${YOUTUBE_ID}`,
    `https://music.youtube.com/watch?v=${YOUTUBE_ID}`,
    `https://youtu.be/${YOUTUBE_ID}`,
    `https://www.youtube.com/live/${YOUTUBE_ID}`,
    `https://www.youtube.com/embed/${YOUTUBE_ID}`,
    `https://www.youtube-nocookie.com/embed/${YOUTUBE_ID}`,
  ])("plays %s through the no-cookie player", (url) => {
    expect(embedOf(url)).toEqual({
      provider: "youtube",
      player: "iframe",
      src: `https://www.youtube-nocookie.com/embed/${YOUTUBE_ID}?autoplay=1&rel=0`,
      load: "poster",
      thumbnail: `https://i.ytimg.com/vi/${YOUTUBE_ID}/hqdefault.jpg`,
      size: { aspectRatio: 16 / 9 },
    });
  });

  it("plays shorts in portrait", () => {
    expect(
      embedOf(`https://www.youtube.com/shorts/${YOUTUBE_ID}`).size,
    ).toEqual({ aspectRatio: 9 / 16 });
  });

  it("carries a start time over to the player", () => {
    expect(embedOf(`https://youtu.be/${YOUTUBE_ID}?t=1m30s`).src).toBe(
      `https://www.youtube-nocookie.com/embed/${YOUTUBE_ID}?autoplay=1&rel=0&start=90`,
    );
  });
});

describe("vimeo", () => {
  it.each([
    "https://vimeo.com/76979871",
    "https://www.vimeo.com/76979871",
    "https://vimeo.com/channels/staffpicks/76979871",
    "https://vimeo.com/groups/name/videos/76979871",
    "https://player.vimeo.com/video/76979871",
  ])("plays %s", (url) => {
    expect(embedOf(url)).toEqual({
      provider: "vimeo",
      player: "iframe",
      src: "https://player.vimeo.com/video/76979871?autoplay=1&dnt=1",
      load: "poster",
      size: { aspectRatio: 16 / 9 },
    });
  });

  it("keeps an unlisted video's privacy hash", () => {
    const src =
      "https://player.vimeo.com/video/76979871?autoplay=1&dnt=1&h=8f2a1c";
    expect(embedOf("https://vimeo.com/76979871/8f2a1c").src).toBe(src);
    expect(
      embedOf("https://player.vimeo.com/video/76979871?h=8f2a1c").src,
    ).toBe(src);
  });

  it("carries a start time over to the player", () => {
    expect(embedOf("https://vimeo.com/76979871#t=1m5s").src).toBe(
      "https://player.vimeo.com/video/76979871?autoplay=1&dnt=1#t=65s",
    );
  });
});

describe("loom", () => {
  it.each([
    `https://www.loom.com/share/${LOOM_ID}`,
    `https://www.loom.com/share/${LOOM_ID}?sid=abc`,
    `https://www.loom.com/share/My-Walkthrough-${LOOM_ID}`,
    `https://loom.com/embed/${LOOM_ID}`,
  ])("plays %s", (url) => {
    expect(embedOf(url)).toEqual({
      provider: "loom",
      player: "iframe",
      src: `https://www.loom.com/embed/${LOOM_ID}?autoplay=1`,
      load: "poster",
      size: { aspectRatio: 16 / 9 },
    });
  });
});

describe("spotify", () => {
  it("gives a track the compact player", () => {
    expect(
      embedOf(`https://open.spotify.com/track/${SPOTIFY_ID}?si=x`),
    ).toEqual({
      provider: "spotify",
      player: "iframe",
      src: `https://open.spotify.com/embed/track/${SPOTIFY_ID}`,
      load: "eager",
      size: { height: 152 },
    });
  });

  it("gives a playlist the tall player", () => {
    expect(
      embedOf(`https://open.spotify.com/playlist/${SPOTIFY_ID}`).size,
    ).toEqual({ height: 352 });
  });

  it.each([
    `https://open.spotify.com/intl-de/album/${SPOTIFY_ID}`,
    `https://open.spotify.com/embed/album/${SPOTIFY_ID}`,
  ])("normalizes %s", (url) => {
    expect(embedOf(url).src).toBe(
      `https://open.spotify.com/embed/album/${SPOTIFY_ID}`,
    );
  });
});

describe("video files", () => {
  it.each([
    "https://cdn.example.com/clip.mp4",
    "https://cdn.example.com/clip.WEBM?token=1",
    "https://cdn.example.com/clip.mov",
  ])("plays %s natively", (url) => {
    expect(embedOf(url)).toEqual({
      provider: "video",
      player: "video",
      src: url,
      load: "eager",
      size: { aspectRatio: 16 / 9 },
    });
  });
});

describe("non-embeds", () => {
  it.each([
    "https://www.youtube.com/",
    "https://www.youtube.com/@channel",
    "https://www.youtube.com/watch?v=short",
    "https://www.youtube.com/playlist?list=PL123",
    `https://notyoutube.com/watch?v=${YOUTUBE_ID}`,
    "https://vimeo.com/channels/staffpicks",
    "https://www.loom.com/looms/videos",
    "https://open.spotify.com/",
    `https://open.spotify.com/user/${SPOTIFY_ID}`,
    "https://example.com/mp4",
    "https://example.com/",
    "not a url",
  ])("leaves %s as a card", (url) => {
    expect(parseEmbed(url)).toBeNull();
  });
});

describe("parseTimestamp", () => {
  it.each([
    ["90", 90],
    ["90s", 90],
    ["1m30s", 90],
    ["1h2m3s", 3723],
    ["2m", 120],
  ])("reads %s as %i seconds", (value, seconds) => {
    expect(parseTimestamp(value)).toBe(seconds);
  });

  it.each([null, "", "abc", "1x"])("ignores %s", (value) => {
    expect(parseTimestamp(value)).toBeNull();
  });
});

describe("embedNodeSize", () => {
  it("fits a video player plus the title strip", () => {
    expect(embedNodeSize(embedOf(`https://youtu.be/${YOUTUBE_ID}`))).toEqual({
      width: 320,
      height: 244,
    });
  });

  it("fits an audio player's set height plus the title strip", () => {
    expect(
      embedNodeSize(embedOf(`https://open.spotify.com/track/${SPOTIFY_ID}`)),
    ).toEqual({ width: 320, height: 216 });
  });
});
