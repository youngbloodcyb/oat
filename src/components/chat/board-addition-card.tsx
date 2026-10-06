"use client";

import {
  CheckIcon,
  CircleNotchIcon,
  GlobeIcon,
  NoteIcon,
  XIcon,
} from "@phosphor-icons/react";
import { useReactFlow } from "@xyflow/react";
import type { EveDynamicToolPart } from "eve/react";
import { useEffect, useRef } from "react";
import type { ChatInputResponse } from "@/components/chat/chat-message";
import { Button } from "@/components/ui/button";
import type { ClientNode } from "@/db/schema";
import { addToBoardSchema, type BoardAddition } from "@/lib/board-additions";
import { toBoardNode, useBoardStore } from "@/lib/store";
import { cn } from "@/lib/utils";

type Phase =
  | "preparing"
  | "awaiting"
  | "adding"
  | "added"
  | "declined"
  | "failed";

/**
 * The agent's request to add items to the board: the person approves or
 * declines it here, then it reports what landed.
 */
export function BoardAdditionCard({
  canRespond,
  isSettled,
  onRespond,
  part,
}: {
  canRespond: boolean;
  isSettled: boolean;
  onRespond: (responses: ChatInputResponse[]) => void;
  part: EveDynamicToolPart;
}) {
  const parsed = addToBoardSchema.safeParse(part.input);
  const items = parsed.success ? parsed.data.items : [];
  const request = part.toolMetadata?.eve?.inputRequest;
  const phase = phaseOf(part, isSettled);
  const added = phase === "added" ? addedNodes(part.output) : [];
  useShowAddedNodes(phase, added);

  return (
    <div
      className={cn(
        "my-2 overflow-hidden rounded-lg border",
        phase === "awaiting" ? "border-primary/40" : "border-border",
      )}
    >
      <div className="flex items-center gap-1.5 px-3 pt-2.5 text-xs text-muted-foreground">
        <PhaseIcon phase={phase} />
        <span>{headline(phase, items.length || added.length)}</span>
      </div>
      <ul className="flex flex-col gap-1.5 px-3 py-2.5">
        {items.map((item, index) => (
          <AdditionRow item={item} key={`${item.type}:${index}`} />
        ))}
      </ul>
      {phase === "awaiting" && request?.options?.length ? (
        <div className="flex justify-end gap-2 border-t border-border bg-muted/30 px-3 py-2">
          {[...request.options].reverse().map((option) => (
            <Button
              disabled={!canRespond}
              key={option.id}
              onClick={() =>
                onRespond([
                  { requestId: request.requestId, optionId: option.id },
                ])
              }
              size="sm"
              variant={option.style === "danger" ? "outline" : "default"}
            >
              {option.label}
            </Button>
          ))}
        </div>
      ) : null}
      {phase === "added" && added.length > 0 && <ShowOnBoard nodes={added} />}
      {phase === "failed" && part.state === "output-error" && (
        <p className="border-t border-border px-3 py-2 text-xs text-destructive">
          {part.errorText}
        </p>
      )}
    </div>
  );
}

function AdditionRow({ item }: { item: BoardAddition }) {
  if (item.type === "text") {
    return (
      <li className="flex items-start gap-2 text-sm">
        <NoteIcon className="mt-1 size-3.5 shrink-0 text-muted-foreground" />
        <span className="line-clamp-2 min-w-0 whitespace-pre-line">
          {item.text}
        </span>
      </li>
    );
  }
  const host = hostOf(item.url);
  return (
    <li className="flex items-start gap-2 text-sm">
      <GlobeIcon className="mt-1 size-3.5 shrink-0 text-muted-foreground" />
      <a
        className="min-w-0 hover:underline"
        href={item.url}
        rel="noreferrer"
        target="_blank"
      >
        <span className="line-clamp-1 font-medium">{item.title ?? host}</span>
        {item.title && (
          <span className="block truncate text-xs text-muted-foreground">
            {host}
          </span>
        )}
      </a>
    </li>
  );
}

function ShowOnBoard({ nodes }: { nodes: ClientNode[] }) {
  const { fitView } = useReactFlow();
  return (
    <div className="flex justify-end border-t border-border px-3 py-2">
      <Button
        onClick={() => {
          void fitView({
            nodes: nodes.map(({ id }) => ({ id })),
            padding: 0.3,
            maxZoom: 1.25,
            duration: 350,
          });
        }}
        size="sm"
        variant="outline"
      >
        Show on board
      </Button>
    </div>
  );
}

/**
 * Puts nodes the agent just added into the local store. Boards that aren't
 * shared have no realtime feed to deliver them. Only additions that finish
 * while this card is mounted count: replayed history must not resurrect
 * nodes that have since been deleted.
 */
function useShowAddedNodes(phase: Phase, added: ClientNode[]) {
  const settledOnMount = useRef(phase === "added");
  const applied = useRef(false);
  useEffect(() => {
    if (settledOnMount.current || applied.current || phase !== "added") return;
    applied.current = true;
    const { upsertRemoteNode } = useBoardStore.getState();
    for (const node of added) upsertRemoteNode(toBoardNode(node));
  }, [phase, added]);
}

function phaseOf(part: EveDynamicToolPart, isSettled: boolean): Phase {
  const eve = part.toolMetadata?.eve;
  if (eve?.inputRequest && !eve.inputResponse) return "awaiting";
  switch (part.state) {
    case "output-available":
      return part.partial ? "adding" : "added";
    case "output-denied":
      return "declined";
    case "output-error":
      return "failed";
    case "input-streaming":
    case "input-available":
      return isSettled ? "failed" : "preparing";
    default:
      return isSettled ? "failed" : "adding";
  }
}

function headline(phase: Phase, count: number) {
  const things = `${count} item${count === 1 ? "" : "s"}`;
  switch (phase) {
    case "preparing":
      return "Preparing items for the board…";
    case "awaiting":
      return `Add ${things} to the board?`;
    case "adding":
      return `Adding ${things}…`;
    case "added":
      return `Added ${things} to the board`;
    case "declined":
      return "Not added to the board";
    case "failed":
      return "Couldn't add to the board";
  }
}

function PhaseIcon({ phase }: { phase: Phase }) {
  if (phase === "preparing" || phase === "adding") {
    return <CircleNotchIcon className="size-3 shrink-0 animate-spin" />;
  }
  if (phase === "added") {
    return <CheckIcon className="size-3 shrink-0 text-emerald-500" />;
  }
  if (phase === "declined" || phase === "failed") {
    return <XIcon className="size-3 shrink-0" />;
  }
  return null;
}

function addedNodes(output: unknown): ClientNode[] {
  if (typeof output !== "object" || output === null) return [];
  const added = (output as { added?: unknown }).added;
  return Array.isArray(added) ? (added as ClientNode[]) : [];
}

function hostOf(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}
