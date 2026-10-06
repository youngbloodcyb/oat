"use client";

import { CheckIcon, GlobeIcon, PlusIcon } from "@phosphor-icons/react";
import { useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { Button } from "@/components/ui/button";
import type { LinkSuggestion } from "@/lib/link-suggestions";
import { useBoardStore } from "@/lib/store";

/** Links the agent suggested, each one click away from the board. */
export function LinkSuggestions({
  links,
  onAdd,
}: {
  links: readonly LinkSuggestion[];
  /** Adds a link to the board; omitted when the person can't edit it. */
  onAdd?: (url: string) => void;
}) {
  // Read from the board itself, so "Added" holds across reloads and covers
  // links that were already there before the agent suggested them.
  const boardUrls = useBoardStore(
    useShallow((s) => [
      ...s.nodes.flatMap((n) => (n.data.kind === "link" ? [n.data.url] : [])),
      ...s.pendingNodes.flatMap((n) =>
        n.data.preview.kind === "link" ? [n.data.preview.url] : [],
      ),
    ]),
  );
  const onBoard = new Set(boardUrls.map(normalizeUrl));

  return (
    <ul className="my-2 flex flex-col divide-y divide-border overflow-hidden rounded-lg border border-border">
      {links.map((link) => (
        <LinkSuggestionRow
          isOnBoard={onBoard.has(normalizeUrl(link.url))}
          key={link.url}
          link={link}
          onAdd={onAdd}
        />
      ))}
    </ul>
  );
}

function LinkSuggestionRow({
  isOnBoard,
  link,
  onAdd,
}: {
  isOnBoard: boolean;
  link: LinkSuggestion;
  onAdd?: (url: string) => void;
}) {
  const [imageFailed, setImageFailed] = useState(false);
  const meta = [link.price, link.source ?? hostOf(link.url)].filter(Boolean);

  return (
    <li className="flex items-center gap-3 p-2">
      <div className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted">
        {link.image && !imageFailed ? (
          // biome-ignore lint/performance/noImgElement: product images come from arbitrary remote hosts.
          <img
            alt=""
            className="size-full object-cover"
            onError={() => setImageFailed(true)}
            src={link.image}
          />
        ) : (
          <GlobeIcon className="size-4 text-muted-foreground" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <a
          className="line-clamp-1 text-sm font-medium hover:underline"
          href={link.url}
          rel="noreferrer"
          target="_blank"
        >
          {link.title}
        </a>
        <p className="truncate text-xs text-muted-foreground">
          {meta.join(" · ")}
        </p>
        {link.description && (
          <p className="line-clamp-1 text-xs text-muted-foreground">
            {link.description}
          </p>
        )}
      </div>
      {onAdd &&
        (isOnBoard ? (
          <Button disabled size="sm" variant="ghost">
            <CheckIcon />
            Added
          </Button>
        ) : (
          <Button onClick={() => onAdd(link.url)} size="sm" variant="outline">
            <PlusIcon />
            Add
          </Button>
        ))}
    </li>
  );
}

function normalizeUrl(url: string) {
  try {
    return new URL(url).href;
  } catch {
    return url;
  }
}

function hostOf(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return undefined;
  }
}
