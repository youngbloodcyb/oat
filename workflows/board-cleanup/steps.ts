import { del, list } from "@vercel/blob";
import { boardKeyPrefix } from "@/lib/blob";
import { eveServerClient } from "@/lib/eve-server-client";

const DELETE_BATCH_SIZE = 100;

/** Deletes the given objects. Throws on failure so the step is retried. */
export async function stepDeleteBlobs(objectKeys: string[]): Promise<void> {
  "use step";

  for (let i = 0; i < objectKeys.length; i += DELETE_BATCH_SIZE) {
    await del(objectKeys.slice(i, i + DELETE_BATCH_SIZE));
  }
}

/**
 * Deletes everything under the board's prefix, including uploads that never
 * became nodes. Returns how many objects were removed.
 */
export async function stepDeleteBoardPrefix(boardId: string): Promise<number> {
  "use step";

  let deleted = 0;
  let cursor: string | undefined;
  do {
    const page = await list({
      prefix: boardKeyPrefix(boardId),
      cursor,
      limit: DELETE_BATCH_SIZE,
    });
    if (page.blobs.length > 0) {
      await del(page.blobs.map((blob) => blob.pathname));
      deleted += page.blobs.length;
    }
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);
  return deleted;
}

/**
 * Retires a chat's eve session. Board chats never time out, so without this
 * the session's stored state would be kept indefinitely.
 */
export async function stepRetireChatSession(sessionId: string): Promise<void> {
  "use step";

  await eveServerClient()
    .sessions.attach(sessionId)
    .reset({ reason: "board deleted" });
}
