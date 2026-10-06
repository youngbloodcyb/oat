"use client";

import { ArrowUpIcon, CheckIcon, XIcon } from "@phosphor-icons/react";
import { useStore, useViewport } from "@xyflow/react";
import {
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from "react";
import { toast } from "sonner";
import { useShallow } from "zustand/react/shallow";
import { colorFor, initials } from "@/components/realtime-collaboration";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";
import {
  loadCommentThreads,
  postCommentReply,
  postCommentThread,
  resolveThread,
  useCommentStore,
} from "@/lib/comment-store";
import {
  type BoardCommentThread,
  type CommentAuthor,
  MAX_COMMENT_CHARS,
} from "@/lib/comments";
import { cn } from "@/lib/utils";

const PIN_SIZE = 32;
const CARD_WIDTH = 288;
const CARD_GAP = 8;

function timeAgo(iso: string): string {
  const seconds = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d`;
  return new Date(iso).toLocaleDateString();
}

function Avatar({
  author,
  className,
}: {
  author: CommentAuthor;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex size-6 shrink-0 items-center justify-center overflow-hidden rounded-full text-[9px] font-semibold text-white",
        className,
      )}
      style={{ backgroundColor: colorFor(author.id) }}
      title={author.name}
    >
      {author.image ? (
        // biome-ignore lint/performance/noImgElement: auth avatars may be remote URLs.
        <img
          src={author.image}
          alt={author.name}
          className="size-full object-cover"
        />
      ) : (
        initials(author.name)
      )}
    </div>
  );
}

/** A speech-bubble pin whose pointed bottom-left corner marks the spot. */
function Pin({
  author,
  active,
  onClick,
  style,
}: {
  author?: CommentAuthor;
  active: boolean;
  onClick?: () => void;
  style: CSSProperties;
}) {
  return (
    <button
      type="button"
      aria-label={author ? `Comment by ${author.name}` : "New comment"}
      onClick={onClick}
      className={cn(
        "pointer-events-auto absolute flex items-center justify-center rounded-full rounded-bl-none bg-primary shadow-md ring-2 ring-white transition-transform hover:scale-105",
        active && "scale-110 hover:scale-110",
      )}
      style={{ width: PIN_SIZE, height: PIN_SIZE, ...style }}
    >
      {author && <Avatar author={author} />}
    </button>
  );
}

// Escape is handled by the board, which closes the open comment. Posting is
// optimistic, so the box clears right away; a failed save shows a toast.
function Composer({
  placeholder,
  disabled = false,
  onSubmit,
}: {
  placeholder: string;
  disabled?: boolean;
  onSubmit: (body: string) => void;
}) {
  const [value, setValue] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const trimmed = value.trim();
  const canSubmit = !disabled && trimmed.length > 0;

  useEffect(() => {
    const frame = requestAnimationFrame(() =>
      textareaRef.current?.focus({ preventScroll: true }),
    );
    return () => cancelAnimationFrame(frame);
  }, []);

  const submit = () => {
    if (!canSubmit) return;
    onSubmit(trimmed);
    setValue("");
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      submit();
    }
  };

  return (
    <form
      className="flex items-end gap-1.5 p-2"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        maxLength={MAX_COMMENT_CHARS}
        rows={1}
        className="field-sizing-content max-h-40 min-h-7 flex-1 resize-none bg-transparent px-1 py-1 text-xs/relaxed outline-none placeholder:text-muted-foreground"
      />
      <Button
        type="submit"
        size="icon-sm"
        className="rounded-full"
        disabled={!canSubmit}
        aria-label="Post comment"
      >
        <ArrowUpIcon weight="bold" />
      </Button>
    </form>
  );
}

function Card({
  children,
  style,
}: {
  children: ReactNode;
  style: CSSProperties;
}) {
  return (
    <div
      className="pointer-events-auto absolute overflow-hidden rounded-xl border bg-card text-card-foreground shadow-lg"
      style={{ width: CARD_WIDTH, ...style }}
    >
      {children}
    </div>
  );
}

function ThreadCard({
  thread,
  currentUser,
  canResolve,
  style,
  onClose,
}: {
  thread: BoardCommentThread;
  /** Null until the session loads; replying waits for it. */
  currentUser: CommentAuthor | null;
  canResolve: boolean;
  style: CSSProperties;
  onClose: () => void;
}) {
  const listRef = useRef<HTMLDivElement>(null);
  const pendingIds = useCommentStore((s) => s.pendingIds);
  const count = thread.comments.length;

  // Keep the newest reply in view as the thread grows.
  useEffect(() => {
    if (count > 0) listRef.current?.scrollTo({ top: Number.MAX_SAFE_INTEGER });
  }, [count]);

  const resolve = () => {
    resolveThread(thread).catch(() => toast.error("Couldn't resolve comment"));
  };

  return (
    <Card style={style}>
      <div className="flex items-center justify-between border-b px-3 py-1.5">
        <span className="text-xs font-medium">Comment</span>
        <div className="flex items-center gap-0.5">
          {canResolve && (
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label="Resolve"
              title="Resolve"
              onClick={resolve}
            >
              <CheckIcon weight="bold" />
            </Button>
          )}
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Close"
            title="Close"
            onClick={onClose}
          >
            <XIcon />
          </Button>
        </div>
      </div>
      <div ref={listRef} className="flex max-h-72 flex-col overflow-y-auto">
        {thread.comments.map((comment) => (
          <div
            key={comment.id}
            className={cn(
              "flex gap-2 px-3 py-2 transition-opacity",
              pendingIds.has(comment.id) && "opacity-60",
            )}
          >
            <Avatar author={comment.author} />
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline gap-1.5">
                <span className="truncate text-xs font-medium">
                  {comment.author.name}
                </span>
                <span className="shrink-0 text-[10px] text-muted-foreground">
                  {timeAgo(comment.createdAt)}
                </span>
              </div>
              <p className="text-xs/relaxed break-words whitespace-pre-wrap">
                {comment.body}
              </p>
            </div>
          </div>
        ))}
      </div>
      <div className="border-t">
        <Composer
          key={thread.id}
          placeholder="Reply…"
          disabled={!currentUser}
          onSubmit={(body) => {
            if (!currentUser) return;
            postCommentReply({ thread, body, author: currentUser }).catch(() =>
              toast.error("Couldn't post reply"),
            );
          }}
        />
      </div>
    </Card>
  );
}

/**
 * Comment pins and their threads, drawn over the canvas. Positions are in
 * flow coordinates and follow the viewport as it pans and zooms.
 */
export function CommentLayer({
  boardId,
  canEdit,
}: {
  boardId: string;
  canEdit: boolean;
}) {
  const viewport = useViewport();
  const width = useStore((s) => s.width);
  const { data: session } = authClient.useSession();
  const currentUser = session?.user;
  const { threads, draft, openThreadId, dismiss, openThread, visible } =
    useCommentStore(
      useShallow((s) => ({
        threads: s.threads,
        draft: s.draft,
        openThreadId: s.openThreadId,
        dismiss: s.dismiss,
        openThread: s.openThread,
        visible: s.boardId === boardId,
      })),
    );

  useEffect(() => {
    void loadCommentThreads(boardId);
  }, [boardId]);

  const toScreen = (position: { x: number; y: number }) => ({
    x: position.x * viewport.zoom + viewport.x,
    y: position.y * viewport.zoom + viewport.y,
  });

  const pinStyle = (point: { x: number; y: number }) => ({
    left: point.x,
    top: point.y - PIN_SIZE,
  });

  // Open beside the pin, flipping left when there's no room on the right.
  const cardStyle = (point: { x: number; y: number }) => {
    const right = point.x + PIN_SIZE + CARD_GAP;
    const left =
      right + CARD_WIDTH > width - CARD_GAP
        ? point.x - CARD_WIDTH - CARD_GAP
        : right;
    return { left, top: Math.max(48, point.y - PIN_SIZE) };
  };

  const openThreadData = visible
    ? threads.find((thread) => thread.id === openThreadId)
    : undefined;
  const author: CommentAuthor | null = currentUser
    ? {
        id: currentUser.id,
        name: currentUser.name,
        image: currentUser.image ?? null,
      }
    : null;

  return (
    <div className="pointer-events-none absolute inset-0 z-30 overflow-hidden">
      {visible &&
        threads.map((thread) => (
          <Pin
            key={thread.id}
            author={thread.author}
            active={thread.id === openThreadId}
            onClick={() =>
              openThread(thread.id === openThreadId ? null : thread.id)
            }
            style={pinStyle(toScreen(thread.position))}
          />
        ))}
      {draft && (
        <>
          <Pin
            author={author ?? undefined}
            active
            style={pinStyle(toScreen(draft))}
          />
          <Card style={cardStyle(toScreen(draft))}>
            <Composer
              key={`${draft.x},${draft.y}`}
              placeholder="Add a comment…"
              disabled={!author}
              onSubmit={(body) => {
                if (!author) return;
                postCommentThread({
                  boardId,
                  position: draft,
                  body,
                  author,
                }).catch(() => toast.error("Couldn't post comment"));
              }}
            />
          </Card>
        </>
      )}
      {openThreadData && (
        <ThreadCard
          thread={openThreadData}
          currentUser={author}
          canResolve={canEdit || openThreadData.author.id === currentUser?.id}
          style={cardStyle(toScreen(openThreadData.position))}
          onClose={dismiss}
        />
      )}
    </div>
  );
}
