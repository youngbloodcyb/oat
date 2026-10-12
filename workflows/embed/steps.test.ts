import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  execute: vi.fn(),
  select: vi.fn(),
  embedSearchDocument: vi.fn(),
  embedSearchImage: vi.fn(),
  loadImageEmbeddingInput: vi.fn(),
  loadPaletteImage: vi.fn(),
  scorePaletteWithModel: vi.fn(),
}));

vi.mock("@/db", () => ({
  db: {
    execute: mocks.execute,
    select: mocks.select,
  },
}));

vi.mock("@/lib/embedding", () => ({
  embedSearchDocument: mocks.embedSearchDocument,
  embedSearchImage: mocks.embedSearchImage,
}));

vi.mock("@/lib/image-embedding", () => ({
  loadImageEmbeddingInput: mocks.loadImageEmbeddingInput,
}));

vi.mock("@/lib/palette", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/palette")>()),
  loadPaletteImage: mocks.loadPaletteImage,
}));

vi.mock("@/lib/palette-decisions", () => ({
  scorePaletteWithModel: mocks.scorePaletteWithModel,
}));

import { PgDialect } from "drizzle-orm/pg-core";
import {
  stepEmbedImage,
  stepEmbedText,
  stepExtractPalette,
  stepGetNodeEmbeddingSource,
  stepUpsertEmbedding,
  stepUpsertPalette,
} from "./steps";

function setSelectedRows(rows: unknown[]) {
  const query = {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue(rows),
  };
  mocks.select.mockReturnValue(query);
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.execute.mockResolvedValue({ rows: [] });
  setSelectedRows([]);
  mocks.embedSearchDocument.mockResolvedValue([0.1, 0.2]);
  mocks.embedSearchImage.mockResolvedValue([0.3, 0.4]);
  mocks.loadImageEmbeddingInput.mockResolvedValue({
    bytes: new Uint8Array([1, 2, 3]),
    mimeType: "image/png",
  });
});

describe("embedding workflow steps", () => {
  it("uses extracted PDF text as the document embedding source", async () => {
    setSelectedRows([
      {
        data: {
          kind: "pdf",
          name: "report.pdf",
          markdown: "# Quarterly report",
          objectKey: "private/report",
        },
        searchText: "report.pdf # Quarterly report",
        sourceKey: "pdf-key",
      },
    ]);

    await expect(stepGetNodeEmbeddingSource("pdf-1")).resolves.toEqual({
      kind: "text",
      sourceKey: "pdf-key",
      title: "report.pdf",
      text: "report.pdf # Quarterly report",
    });
  });

  it("uses an image object key instead of image alt text", async () => {
    setSelectedRows([
      {
        data: {
          kind: "image",
          objectKey: "private/image",
          alt: "A whiteboard",
        },
        searchText: "A whiteboard",
        sourceKey: "image-key",
      },
    ]);

    await expect(stepGetNodeEmbeddingSource("image-1")).resolves.toEqual({
      kind: "image",
      sourceKey: "image-key",
      objectKey: "private/image",
    });
  });

  it("embeds searchable document text through Gemini", async () => {
    const input = { title: "Roadmap", text: "Quarterly roadmap" };

    await expect(stepEmbedText(input)).resolves.toEqual([0.1, 0.2]);
    expect(mocks.embedSearchDocument).toHaveBeenCalledWith(input);
  });

  it("loads and embeds the actual private image", async () => {
    await expect(stepEmbedImage("private/image")).resolves.toEqual([0.3, 0.4]);
    expect(mocks.loadImageEmbeddingInput).toHaveBeenCalledWith("private/image");
    expect(mocks.embedSearchImage).toHaveBeenCalledWith({
      bytes: new Uint8Array([1, 2, 3]),
      mimeType: "image/png",
    });
  });

  it("only stores an embedding while its binary or text source is current", async () => {
    await stepUpsertEmbedding({
      nodeId: "node-1",
      sourceKey: "source-key",
      embedding: [0.1, 0.2],
    });

    const statement = mocks.execute.mock.calls[0][0];
    const compiled = new PgDialect().sqlToQuery(statement);
    expect(compiled.sql).toContain('INSERT INTO "embeddings" (');
    expect(compiled.sql).toContain('"nodes"."embedding_source" =');
    expect(compiled.sql).toContain('ON CONFLICT ("node_id")');
    expect(compiled.params).toContain("node-1");
    expect(compiled.params).toContain("source-key");
    expect(compiled.params).toContain("[0.1,0.2]");
  });

  it("scores extracted palette colors with the decision model", async () => {
    mocks.loadPaletteImage.mockResolvedValue({
      pixels: Uint8Array.from([196, 100, 63, 255]),
      preview: new Uint8Array([9]),
    });
    mocks.scorePaletteWithModel.mockImplementation(async ({ candidates }) =>
      candidates.map((c: object) => ({ ...c, role: "primary", salience: 1 })),
    );

    const palette = await stepExtractPalette("private/image");

    expect(mocks.loadPaletteImage).toHaveBeenCalledWith("private/image");
    expect(mocks.scorePaletteWithModel).toHaveBeenCalledWith({
      candidates: [expect.objectContaining({ hex: "#C4643F", share: 1 })],
      preview: new Uint8Array([9]),
    });
    expect(palette).toEqual({
      scoredBy: "model",
      colors: [expect.objectContaining({ hex: "#C4643F", role: "primary" })],
    });
  });

  it("falls back to heuristic roles when the decision model fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.loadPaletteImage.mockResolvedValue({
      pixels: Uint8Array.from([196, 100, 63, 255]),
      preview: new Uint8Array([9]),
    });
    mocks.scorePaletteWithModel.mockRejectedValue(new Error("gateway down"));

    await expect(stepExtractPalette("private/image")).resolves.toEqual({
      scoredBy: "heuristic",
      colors: [expect.objectContaining({ hex: "#C4643F", role: "primary" })],
    });
  });

  it("only stores a palette while the node's image is current", async () => {
    await stepUpsertPalette({
      nodeId: "node-1",
      sourceKey: "source-key",
      palette: {
        scoredBy: "model",
        colors: [
          {
            hex: "#C4643F",
            share: 1,
            lightness: 0.62,
            chroma: 0.13,
            role: "primary",
            salience: 1,
          },
        ],
      },
    });

    const statement = mocks.execute.mock.calls[0][0];
    const compiled = new PgDialect().sqlToQuery(statement);
    expect(compiled.sql).toContain('INSERT INTO "palettes" (');
    expect(compiled.sql).toContain('"nodes"."embedding_source" =');
    expect(compiled.sql).toContain('ON CONFLICT ("node_id")');
    expect(compiled.params).toContain("node-1");
    expect(compiled.params).toContain("source-key");
    expect(compiled.params).toContain("model");
    expect(
      compiled.params.some(
        (p) => typeof p === "string" && p.includes('"hex":"#C4643F"'),
      ),
    ).toBe(true);
  });
});
