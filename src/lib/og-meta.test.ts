import { describe, expect, it } from "vitest";
import { parseMeta } from "./og-meta";

const base = "https://example.com/articles/post";

describe("parseMeta", () => {
  it("reads open graph fields and resolves a relative image", () => {
    const meta = parseMeta(
      `<head>
        <meta property="og:title" content="A &amp; B">
        <meta name="description" content="About things">
        <meta property="og:image" content="/cover.png">
        <meta property="og:site_name" content="Example">
      </head>`,
      base,
    );

    expect(meta).toMatchObject({
      title: "A & B",
      description: "About things",
      image: "https://example.com/cover.png",
      siteName: "Example",
    });
  });

  it("prefers the apple-touch-icon over a plain icon", () => {
    const meta = parseMeta(
      `<link rel="icon" href="/favicon-32.png">
       <link rel="apple-touch-icon" href="/touch.png">`,
      base,
    );
    expect(meta.icon).toBe("https://example.com/touch.png");
  });

  it("matches multi-value rels like 'shortcut icon'", () => {
    const meta = parseMeta(`<link rel="shortcut icon" href="icon.ico">`, base);
    expect(meta.icon).toBe("https://example.com/articles/icon.ico");
  });

  it("falls back to /favicon.ico when the page declares no icon", () => {
    expect(parseMeta("<title>Hi</title>", base).icon).toBe(
      "https://example.com/favicon.ico",
    );
  });

  it("drops icons and images that aren't http(s)", () => {
    const meta = parseMeta(
      `<link rel="icon" href="javascript:alert(1)">
       <meta property="og:image" content="data:image/png;base64,AAAA">`,
      base,
    );
    expect(meta.icon).toBeUndefined();
    expect(meta.image).toBeUndefined();
  });

  it("keeps only hex theme colors, since they're used in inline styles", () => {
    expect(
      parseMeta(`<meta name="theme-color" content="#1A2B3C">`, base).themeColor,
    ).toBe("#1A2B3C");
    expect(
      parseMeta(
        `<meta name="theme-color" content="red; background: url(x)">`,
        base,
      ).themeColor,
    ).toBeUndefined();
  });
});
