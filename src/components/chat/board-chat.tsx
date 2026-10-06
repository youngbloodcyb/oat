"use client";

import { useReactFlow, useStoreApi } from "@xyflow/react";
import type { MessageStreamEvent } from "eve/client";
import { useEveAgent } from "eve/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useBoardPermissions } from "@/components/board-permissions";
import { ChatComposer } from "@/components/chat/chat-composer";
import {
  ChatConversation,
  ChatConversationContent,
  ChatScrollButton,
} from "@/components/chat/chat-conversation";
import { ChatMessage } from "@/components/chat/chat-message";
import { ComposerSelection } from "@/components/chat/selection-chips";
import { Button } from "@/components/ui/button";
import { useBoardActions } from "@/hooks/use-board-actions";
import { useFocusNode } from "@/hooks/use-focus-node";
import {
  type SelectionItem,
  selectedItems,
  selectionBlock,
} from "@/lib/chat-selection";
import { useBoardStore } from "@/lib/store";
import {
  appendBoardChatEvents,
  type SavedBoardChat,
  saveBoardChatSession,
} from "@/services/board-chats";

// Stays well under the server action body limit, even with long tool results.
const EVENTS_PER_SAVE = 300;

const SUGGESTIONS = [
  "Summarize this board",
  "What themes connect these items?",
  "What's missing from this board?",
];

/** The live agent session, seeded with the chat history loaded on the server. */
export function BoardChat({
  boardId,
  boardName,
  saved,
}: {
  boardId: string;
  boardName: string;
  saved: SavedBoardChat | null;
}) {
  const [draft, setDraft] = useState("");
  const sessionIdRef = useRef(saved?.sessionId ?? null);
  const savedCountRef = useRef(saved?.events.length ?? 0);
  // Saves run one at a time, in order: the session row must exist before
  // its events, and each batch starts where the previous one ended.
  const saveQueueRef = useRef<Promise<void>>(Promise.resolve());

  const enqueueSave = useCallback((save: () => Promise<void>) => {
    saveQueueRef.current = saveQueueRef.current.then(save).catch((error) => {
      console.error("board chat save failed", error);
      toast.error("Couldn't save this chat. Recent messages may be lost.");
    });
  }, []);

  const agent = useEveAgent({
    initialEvents: saved?.events ?? [],
    initialSession: saved?.sessionId
      ? { sessionId: saved.sessionId, streamIndex: saved.streamIndex }
      : undefined,
    resume: Boolean(saved?.sessionId),
    prepareSend: (input) => ({
      ...input,
      clientContext: { boardId, boardName },
    }),
    onSessionChange: (session) => {
      if (!session || session.sessionId === sessionIdRef.current) return;
      const { sessionId } = session;
      sessionIdRef.current = sessionId;
      enqueueSave(() => saveBoardChatSession({ boardId, sessionId }));
    },
    onError: (error) => toast.error(error.message),
  });

  // Save new events whenever the session settles. This also catches up
  // events from a turn that finished while this board was closed.
  const { events, session, status } = agent;
  useEffect(() => {
    if (status !== "ready" && status !== "error") return;
    if (!session || events.length <= savedCountRef.current) return;
    enqueueSave(() => saveEvents(boardId, session, events, savedCountRef));
  }, [boardId, enqueueSave, events, session, status]);

  const addLink = useAddLinkToBoard(boardId);
  const { canEdit } = useBoardPermissions();
  const focusNode = useFocusNode();
  const focusItem = useCallback(
    (item: SelectionItem) => {
      if (!focusNode(item.id)) {
        toast(`“${item.title}” is no longer on the board`);
      }
    },
    [focusNode],
  );

  const isBusy = status === "submitted" || status === "streaming";
  const isResuming = status === "resuming";
  const messages = agent.data.messages;
  const last = messages.at(-1);
  const showThinking = isBusy && last?.role !== "assistant";

  // Whatever is selected on the board goes along with the message.
  const send = (text: string) => {
    setDraft("");
    const items = selectedItems(useBoardStore.getState().nodes);
    const message =
      items.length > 0
        ? [
            { type: "text" as const, text },
            { type: "text" as const, text: selectionBlock(items) },
          ]
        : text;
    agent.send(message).catch(() => setDraft(text));
  };

  return (
    <>
      <ChatConversation>
        <ChatConversationContent>
          {messages.length === 0 && !isResuming ? (
            <EmptyState disabled={isBusy} onPick={send} />
          ) : (
            messages.map((message) => (
              <ChatMessage
                canRespond={status === "ready"}
                isStreaming={isBusy && message === last}
                key={message.id}
                message={message}
                onAddLink={canEdit ? addLink : undefined}
                onSelectItem={focusItem}
                onRespond={(responses) => {
                  agent
                    .respond(responses)
                    .catch((error: Error) => toast.error(error.message));
                }}
              />
            ))
          )}
          {showThinking && (
            <p className="shimmer-text w-fit text-xs">Thinking…</p>
          )}
        </ChatConversationContent>
        <ChatScrollButton />
      </ChatConversation>
      <div className="p-3 pt-0">
        <ChatComposer
          context={<ComposerSelection />}
          disabled={isResuming}
          isBusy={isBusy}
          onChange={setDraft}
          onStop={() => {
            agent.cancel().catch((error: Error) => toast.error(error.message));
          }}
          onSubmit={send}
          placeholder={isResuming ? "Loading conversation…" : undefined}
          value={draft}
        />
      </div>
    </>
  );
}

// Each link added from the chat lands a step down and right of the last, so a
// handful added in a row fan out instead of stacking exactly.
const ADD_STAGGER = 24;
const ADD_STAGGER_STEPS = 6;

/** Adds a link node at the center of the visible canvas. */
function useAddLinkToBoard(boardId: string) {
  const { addDraft } = useBoardActions(boardId);
  const { screenToFlowPosition } = useReactFlow();
  const flowStore = useStoreApi();
  const addedRef = useRef(0);

  return useCallback(
    (url: string) => {
      // The chat sidebar narrows the canvas, so center on the canvas itself.
      const rect = flowStore.getState().domNode?.getBoundingClientRect();
      const center = screenToFlowPosition({
        x: rect ? rect.left + rect.width / 2 : window.innerWidth / 2,
        y: rect ? rect.top + rect.height / 2 : window.innerHeight / 2,
      });
      const step = (addedRef.current++ % ADD_STAGGER_STEPS) * ADD_STAGGER;
      addDraft(
        { kind: "link", url },
        { x: center.x + step, y: center.y + step },
      );
    },
    [addDraft, flowStore, screenToFlowPosition],
  );
}

async function saveEvents(
  boardId: string,
  session: { sessionId: string; streamIndex: number },
  events: readonly MessageStreamEvent[],
  savedCountRef: { current: number },
) {
  while (savedCountRef.current < events.length) {
    const fromIndex = savedCountRef.current;
    const batch = events.slice(fromIndex, fromIndex + EVENTS_PER_SAVE);
    const isLast = fromIndex + batch.length >= events.length;
    await appendBoardChatEvents({
      boardId,
      sessionId: session.sessionId,
      fromIndex,
      // Only advance the resume cursor once every event before it is saved.
      streamIndex: isLast ? session.streamIndex : 0,
      events: batch,
    });
    savedCountRef.current = fromIndex + batch.length;
  }
}

function EmptyState({
  disabled,
  onPick,
}: {
  disabled: boolean;
  onPick: (text: string) => void;
}) {
  return (
    <div className="flex flex-col items-start gap-3 pt-6">
      <p className="text-sm text-muted-foreground">
        Ask anything about what&rsquo;s on this board.
      </p>
      <div className="flex flex-col items-start gap-1.5">
        {SUGGESTIONS.map((suggestion) => (
          <Button
            disabled={disabled}
            key={suggestion}
            onClick={() => onPick(suggestion)}
            size="sm"
            variant="outline"
          >
            {suggestion}
          </Button>
        ))}
      </div>
    </div>
  );
}
