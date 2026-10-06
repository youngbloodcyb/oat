"use client";

import {
  CheckIcon,
  CircleNotchIcon,
  FilePdfIcon,
  GlobeIcon,
  ImageIcon,
  NoteIcon,
  XIcon,
} from "@phosphor-icons/react";
import { useReactFlow } from "@xyflow/react";
import type { EveDynamicToolPart } from "eve/react";
import { type ReactNode, useEffect, useRef } from "react";
import type { ChatInputResponse } from "@/components/chat/chat-message";
import { Button } from "@/components/ui/button";
import type { ClientNode } from "@/db/schema";
import {
  addToBoardSchema,
  type BoardAddition,
  type RemovedNode,
  removeFromBoardSchema,
} from "@/lib/board-changes";
import { type BoardNode, toBoardNode, useBoardStore } from "@/lib/store";
import { cn } from "@/lib/utils";

/** Agent tools that change the board, each behind an approval card. */
export const BOARD_CHANGE_TOOLS = new Set([
  "add_to_board",
  "remove_from_board",
]);

type Phase =
  | "preparing"
  | "awaiting"
  | "working"
  | "done"
  | "declined"
  | "failed";

type Props = {
  canRespond: boolean;
  isSettled: boolean;
  onRespond: (responses: ChatInputResponse[]) => void;
  part: EveDynamicToolPart;
};

/**
 * The agent's request to change the board: the person approves or declines
 * it here, then it reports what changed.
 */
export function BoardChangeCard(props: Props) {
  const name = props.part.toolMetadata?.eve?.name ?? props.part.toolName;
  return name === "remove_from_board" ? (
    <RemovalCard {...props} />
  ) : (
    <AdditionCard {...props} />
  );
}

function AdditionCard({ part, isSettled, ...rest }: Props) {
  const parsed = addToBoardSchema.safeParse(part.input);
  const items = parsed.success ? parsed.data.items : [];
  const phase = phaseOf(part, isSettled);
  const added = phase === "done" ? outputList<ClientNode>(part, "added") : [];
  const things = count(items.length || added.length);

  useOnLiveCompletion(phase, () => {
    // Boards that aren't shared have no realtime feed to deliver these.
    const { upsertRemoteNode } = useBoardStore.getState();
    for (const node of added) upsertRemoteNode(toBoardNode(node));
  });

  return (
    <CardShell
      footer={
        added.length > 0 && <ShowOnBoard nodeIds={added.map((n) => n.id)} />
      }
      headline={
        {
          preparing: "Preparing items for the board…",
          awaiting: `Add ${things} to the board?`,
          working: `Adding ${things}…`,
          done: `Added ${things} to the board`,
          declined: "Not added to the board",
          failed: "Couldn't add to the board",
        }[phase]
      }
      part={part}
      phase={phase}
      {...rest}
    >
      {items.map((item, index) => (
        <AdditionRow item={item} key={`${item.type}:${index}`} />
      ))}
    </CardShell>
  );
}

function RemovalCard({ part, isSettled, ...rest }: Props) {
  const parsed = removeFromBoardSchema.safeParse(part.input);
  const nodeIds = parsed.success ? parsed.data.nodeIds : [];
  const phase = phaseOf(part, isSettled);
  const removed =
    phase === "done" ? outputList<RemovedNode>(part, "removed") : [];
  const things = count(phase === "done" ? removed.length : nodeIds.length);

  useOnLiveCompletion(phase, () => {
    const { removeRemoteNode } = useBoardStore.getState();
    for (const node of removed) removeRemoteNode(node.id);
  });

  return (
    <CardShell
      headline={
        {
          preparing: "Preparing to delete from the board…",
          awaiting: `Delete ${things} from the board?`,
          working: `Deleting ${things}…`,
          done: `Deleted ${things} from the board`,
          declined: "Nothing deleted",
          failed: "Couldn't delete from the board",
        }[phase]
      }
      part={part}
      phase={phase}
      {...rest}
    >
      {phase === "done"
        ? removed.map((node) => (
            <ItemRow
              icon={iconFor(node.type)}
              key={node.id}
              muted
              title={node.title}
            />
          ))
        : nodeIds.map((id) => <BoardNodeRow key={id} nodeId={id} />)}
    </CardShell>
  );
}

function CardShell({
  canRespond,
  children,
  footer,
  headline,
  onRespond,
  part,
  phase,
}: Omit<Props, "isSettled"> & {
  children: ReactNode;
  footer?: ReactNode;
  headline: string;
  phase: Phase;
}) {
  const request = part.toolMetadata?.eve?.inputRequest;

  return (
    <div
      className={cn(
        "my-2 overflow-hidden rounded-lg border",
        phase === "awaiting" ? "border-primary/40" : "border-border",
      )}
    >
      <div className="flex items-center gap-1.5 px-3 pt-2.5 text-xs text-muted-foreground">
        <PhaseIcon phase={phase} />
        <span>{headline}</span>
      </div>
      <ul className="flex flex-col gap-1.5 px-3 py-2.5">{children}</ul>
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
      {phase === "done" && footer}
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
    return <ItemRow icon={NoteIcon} title={item.text} wrap />;
  }
  const host = hostOf(item.url);
  return (
    <ItemRow
      href={item.url}
      icon={GlobeIcon}
      subtitle={item.title ? host : undefined}
      title={item.title ?? host}
    />
  );
}

/** An item the agent wants to delete, read from the board as it is now. */
function BoardNodeRow({ nodeId }: { nodeId: string }) {
  const node = useBoardStore((s) => s.nodes.find((n) => n.id === nodeId));
  const { fitView } = useReactFlow();
  if (!node) {
    return <ItemRow icon={XIcon} muted title="No longer on the board" />;
  }
  return (
    <ItemRow
      icon={iconFor(node.type)}
      // Let the person check what will go before they approve.
      onClick={() => {
        void fitView({
          nodes: [{ id: nodeId }],
          padding: 0.5,
          maxZoom: 1.25,
          duration: 350,
        });
      }}
      title={titleOf(node)}
    />
  );
}

function ItemRow({
  href,
  icon: Icon,
  muted,
  onClick,
  subtitle,
  title,
  wrap,
}: {
  href?: string;
  icon: typeof GlobeIcon;
  muted?: boolean;
  onClick?: () => void;
  subtitle?: string;
  title: string;
  wrap?: boolean;
}) {
  const label = (
    <>
      <span
        className={cn(
          "font-medium",
          wrap
            ? "line-clamp-2 font-normal whitespace-pre-line"
            : "line-clamp-1",
        )}
      >
        {title}
      </span>
      {subtitle && (
        <span className="block truncate text-xs text-muted-foreground">
          {subtitle}
        </span>
      )}
    </>
  );
  const labelClass = "min-w-0 text-left hover:underline";

  return (
    <li
      className={cn(
        "flex items-start gap-2 text-sm",
        muted && "text-muted-foreground",
      )}
    >
      <Icon className="mt-1 size-3.5 shrink-0 text-muted-foreground" />
      {href ? (
        <a className={labelClass} href={href} rel="noreferrer" target="_blank">
          {label}
        </a>
      ) : onClick ? (
        <button className={labelClass} onClick={onClick} type="button">
          {label}
        </button>
      ) : (
        <span className="min-w-0">{label}</span>
      )}
    </li>
  );
}

function ShowOnBoard({ nodeIds }: { nodeIds: string[] }) {
  const { fitView } = useReactFlow();
  return (
    <div className="flex justify-end border-t border-border px-3 py-2">
      <Button
        onClick={() => {
          void fitView({
            nodes: nodeIds.map((id) => ({ id })),
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
 * Applies a finished change to the local store, once. Only changes that
 * finish while this card is mounted count: replayed history must not
 * resurrect deleted nodes or delete ones added back since.
 */
function useOnLiveCompletion(phase: Phase, apply: () => void) {
  const doneOnMount = useRef(phase === "done");
  const applied = useRef(false);
  const applyRef = useRef(apply);
  applyRef.current = apply;
  useEffect(() => {
    if (doneOnMount.current || applied.current || phase !== "done") return;
    applied.current = true;
    applyRef.current();
  }, [phase]);
}

function phaseOf(part: EveDynamicToolPart, isSettled: boolean): Phase {
  const eve = part.toolMetadata?.eve;
  if (eve?.inputRequest && !eve.inputResponse) return "awaiting";
  switch (part.state) {
    case "output-available":
      return part.partial ? "working" : "done";
    case "output-denied":
      return "declined";
    case "output-error":
      return "failed";
    case "input-streaming":
    case "input-available":
      return isSettled ? "failed" : "preparing";
    default:
      return isSettled ? "failed" : "working";
  }
}

function PhaseIcon({ phase }: { phase: Phase }) {
  if (phase === "preparing" || phase === "working") {
    return <CircleNotchIcon className="size-3 shrink-0 animate-spin" />;
  }
  if (phase === "done") {
    return <CheckIcon className="size-3 shrink-0 text-emerald-500" />;
  }
  if (phase === "declined" || phase === "failed") {
    return <XIcon className="size-3 shrink-0" />;
  }
  return null;
}

function outputList<T>(part: EveDynamicToolPart, key: string): T[] {
  const output = part.output;
  if (typeof output !== "object" || output === null) return [];
  const list = (output as Record<string, unknown>)[key];
  return Array.isArray(list) ? (list as T[]) : [];
}

function iconFor(type: string) {
  switch (type) {
    case "link":
      return GlobeIcon;
    case "image":
      return ImageIcon;
    case "pdf":
      return FilePdfIcon;
    default:
      return NoteIcon;
  }
}

function titleOf(node: BoardNode): string {
  switch (node.data.kind) {
    case "link":
      return node.data.og?.title?.trim() || hostOf(node.data.url);
    case "text": {
      const text = node.data.text
        .replace(/<[^>]*>/g, " ")
        .replace(/\s+/g, " ")
        .trim();
      return text || "Empty note";
    }
    case "image":
      return node.data.alt?.trim() || "Image";
    case "pdf":
      return node.data.name;
  }
}

function count(n: number) {
  return `${n} item${n === 1 ? "" : "s"}`;
}

function hostOf(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}
