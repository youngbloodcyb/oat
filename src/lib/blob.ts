import { copy, del, head } from "@vercel/blob";

/**
 * Every object for a board lives under this prefix, so deleting a board can
 * sweep it, including uploads that never became nodes. Keys made before
 * this scheme (`{userId}/{boardId}/…`) are only cleaned up through nodes.
 */
export function boardKeyPrefix(boardId: string): string {
  return `${boardId}/`;
}

/** The prefix one user's uploads to a board must use. */
export function uploadKeyPrefix(userId: string, boardId: string): string {
  return `${boardKeyPrefix(boardId)}${userId}/`;
}

/** Build a collision-resistant, board/uploader-scoped object key. */
export function objectKeyFor(userId: string, boardId: string): string {
  return `${uploadKeyPrefix(userId, boardId)}${crypto.randomUUID()}`;
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
