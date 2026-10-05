import { describe, expect, it } from "vitest";
import { embedNodeSize, parseEmbed, parseYouTubeTime } from "./embed";

const ID = "dQw4w9WgXcQ";

describe("parseEmbed", () => {
  it.each([
    `https://www.youtube.com/watch?v=${ID}`,
    `https://youtube.com/watch?v=${ID}&list=PL123`,
    `https://m.youtube.com/watch?v=${ID}`,
    `https://music.youtube.com/watch?v=${ID}`,
    `https://youtu.be/${ID}`,
    `https://www.youtube.com/live/${ID}`,
    `https://www.youtube.com/embed/${ID}`,
    `https://www.youtube-nocookie.com/embed/${ID}`,
  ])("plays %s through the no-cookie player", (url) => {
    const embed = parseEmbed(url);
    expect(embed).toMatchObject({
      provider: "youtube",
      thumbnail: `https://i.ytimg.com/vi/${ID}/hqdefault.jpg`,
      aspectRatio: 16 / 9,
    });
    expect(embed?.src).toBe(
      `https://www.youtube-nocookie.com/embed/${ID}?autoplay=1&rel=0`,
    );
  });

  it("plays shorts in portrait", () => {
    expect(
      parseEmbed(`https://www.youtube.com/shorts/${ID}`)?.aspectRatio,
    ).toBe(9 / 16);
  });

  it("carries a start time over to the player", () => {
    expect(parseEmbed(`https://youtu.be/${ID}?t=1m30s`)?.src).toBe(
      `https://www.youtube-nocookie.com/embed/${ID}?autoplay=1&rel=0&start=90`,
    );
  });

  it.each([
    "https://www.youtube.com/",
    "https://www.youtube.com/@channel",
    "https://www.youtube.com/watch?v=short",
    "https://www.youtube.com/playlist?list=PL123",
    `https://notyoutube.com/watch?v=${ID}`,
    "https://example.com/",
    "not a url",
  ])("leaves %s as a card", (url) => {
    expect(parseEmbed(url)).toBeNull();
  });
});

describe("parseYouTubeTime", () => {
  it.each([
    ["90", 90],
    ["90s", 90],
    ["1m30s", 90],
    ["1h2m3s", 3723],
    ["2m", 120],
  ])("reads %s as %i seconds", (value, seconds) => {
    expect(parseYouTubeTime(value)).toBe(seconds);
  });

  it.each([null, "", "abc", "1x"])("ignores %s", (value) => {
    expect(parseYouTubeTime(value)).toBeNull();
  });
});

describe("embedNodeSize", () => {
  it("fits the player plus the title strip", () => {
    const embed = parseEmbed(`https://youtu.be/${ID}`);
    if (!embed) throw new Error("expected an embed");
    expect(embedNodeSize(embed)).toEqual({ width: 320, height: 244 });
  });
});
