import { beforeEach, describe, expect, it, vi } from "vitest";

const steps = vi.hoisted(() => ({
  getNodeEmbeddingSource: vi.fn(),
  embedText: vi.fn(),
  embedImage: vi.fn(),
  upsertEmbedding: vi.fn(),
  deleteEmbedding: vi.fn(),
  extractPalette: vi.fn(),
  upsertPalette: vi.fn(),
}));

vi.mock("./steps", () => ({
  stepGetNodeEmbeddingSource: steps.getNodeEmbeddingSource,
  stepEmbedText: steps.embedText,
  stepEmbedImage: steps.embedImage,
  stepUpsertEmbedding: steps.upsertEmbedding,
  stepDeleteEmbedding: steps.deleteEmbedding,
  stepExtractPalette: steps.extractPalette,
  stepUpsertPalette: steps.upsertPalette,
}));

import { workflowEmbedNode } from "./index";

beforeEach(() => {
  vi.clearAllMocks();
  steps.embedText.mockResolvedValue([0.1, 0.2]);
  steps.embedImage.mockResolvedValue([0.3, 0.4]);
  steps.upsertEmbedding.mockResolvedValue(undefined);
  steps.deleteEmbedding.mockResolvedValue(undefined);
  steps.extractPalette.mockResolvedValue({ scoredBy: "model", colors: [] });
  steps.upsertPalette.mockResolvedValue(undefined);
});

describe("workflowEmbedNode", () => {
  it("embeds extracted document text and stores its source key", async () => {
    steps.getNodeEmbeddingSource.mockResolvedValue({
      kind: "text",
      sourceKey: "text-key",
      title: "report.pdf",
      text: "Quarterly roadmap",
    });

    await workflowEmbedNode("node-1");

    expect(steps.embedText).toHaveBeenCalledWith({
      title: "report.pdf",
      text: "Quarterly roadmap",
    });
    expect(steps.embedImage).not.toHaveBeenCalled();
    expect(steps.extractPalette).not.toHaveBeenCalled();
    expect(steps.upsertEmbedding).toHaveBeenCalledWith({
      nodeId: "node-1",
      sourceKey: "text-key",
      embedding: [0.1, 0.2],
    });
  });

  it("embeds the image object rather than its alt text", async () => {
    steps.getNodeEmbeddingSource.mockResolvedValue({
      kind: "image",
      sourceKey: "image-key",
      objectKey: "user-a/board-a/image",
    });

    await workflowEmbedNode("image-1");

    expect(steps.embedImage).toHaveBeenCalledWith("user-a/board-a/image");
    expect(steps.embedText).not.toHaveBeenCalled();
    expect(steps.upsertEmbedding).toHaveBeenCalledWith({
      nodeId: "image-1",
      sourceKey: "image-key",
      embedding: [0.3, 0.4],
    });
    expect(steps.extractPalette).toHaveBeenCalledWith("user-a/board-a/image");
    expect(steps.upsertPalette).toHaveBeenCalledWith({
      nodeId: "image-1",
      sourceKey: "image-key",
      palette: { scoredBy: "model", colors: [] },
    });
  });

  it("deletes a stale embedding when the node has no embeddable source", async () => {
    steps.getNodeEmbeddingSource.mockResolvedValue(null);

    await workflowEmbedNode("node-1");

    expect(steps.deleteEmbedding).toHaveBeenCalledWith("node-1");
    expect(steps.embedText).not.toHaveBeenCalled();
    expect(steps.embedImage).not.toHaveBeenCalled();
    expect(steps.upsertEmbedding).not.toHaveBeenCalled();
  });
});
