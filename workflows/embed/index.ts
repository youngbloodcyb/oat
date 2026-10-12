import {
  stepDeleteEmbedding,
  stepEmbedImage,
  stepEmbedText,
  stepExtractPalette,
  stepGetNodeEmbeddingSource,
  stepUpsertEmbedding,
  stepUpsertPalette,
} from "./steps";

export async function workflowEmbedNode(nodeId: string) {
  "use workflow";

  const source = await stepGetNodeEmbeddingSource(nodeId);
  if (!source) {
    await stepDeleteEmbedding(nodeId);
    return;
  }

  const embedding =
    source.kind === "image"
      ? await stepEmbedImage(source.objectKey)
      : await stepEmbedText({ title: source.title, text: source.text });

  await stepUpsertEmbedding({
    nodeId,
    sourceKey: source.sourceKey,
    embedding,
  });

  if (source.kind === "image") {
    const palette = await stepExtractPalette(source.objectKey);
    await stepUpsertPalette({
      nodeId,
      sourceKey: source.sourceKey,
      palette,
    });
  }
}
