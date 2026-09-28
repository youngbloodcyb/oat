import { copy, del, head } from "@vercel/blob";

/** Build a collision-resistant, owner/board-scoped object key. */
export function objectKeyFor(userId: string, boardId: string): string {
  return `${userId}/${boardId}/${crypto.randomUUID()}`;
}

/** Confirm a blob exists at the given key (upload-completion validation). */
export async function blobExists(objectKey: string): Promise<boolean> {
  try {
    const meta = await head(objectKey);
    return !!meta;
  } catch {
    return false;
  }
}

/** Copy a private blob to a new key, returning the stored pathname. */
export async function copyBlob(
  fromKey: string,
  toKey: string,
): Promise<string> {
  // copy() drops metadata and our keys have no extension, so carry the type over.
  const { contentType } = await head(fromKey);
  const { pathname } = await copy(fromKey, toKey, {
    access: "private",
    contentType,
    addRandomSuffix: true,
  });
  return pathname;
}

/** Best-effort blob deletion; logs instead of throwing so cleanup is retryable. */
export async function deleteBlob(objectKey: string): Promise<void> {
  try {
    await del(objectKey);
  } catch (err) {
    console.error("blob delete failed", objectKey, err);
  }
}

/** Extract object keys from node data (image/pdf only). */
export function nodeObjectKey(data: {
  kind: string;
  objectKey?: string;
}): string | undefined {
  return data.kind === "image" || data.kind === "pdf"
    ? data.objectKey
    : undefined;
}
