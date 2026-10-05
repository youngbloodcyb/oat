import {
  stepDeleteBlobs,
  stepDeleteBoardPrefix,
  stepRetireChatSession,
} from "./steps";

export type BoardCleanup = {
  boardId: string;
  /** Node objects, including ones stored under the older key scheme. */
  objectKeys: string[];
  /** eve sessions behind the board's chats. */
  sessionIds: string[];
};

/** Removes what a deleted board leaves outside Postgres. Steps retry on failure. */
export async function workflowCleanUpBoard(cleanup: BoardCleanup) {
  "use workflow";

  await stepDeleteBlobs(cleanup.objectKeys);
  await stepDeleteBoardPrefix(cleanup.boardId);
  for (const sessionId of cleanup.sessionIds) {
    await stepRetireChatSession(sessionId);
  }
}
