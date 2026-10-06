"use client";

import { CheckIcon, GlobeIcon, PlusIcon } from "@phosphor-icons/react";
import { createContext, type ReactNode, useContext, useState } from "react";
import { Button } from "@/components/ui/button";
import type { LinkSuggestion } from "@/lib/link-suggestions";
import { useBoardStore } from "@/lib/store";

type AddLink = (url: string) => void;

// Unset when the person can't edit the board, which hides every add button.
const AddLinkContext = createContext<AddLink | undefined>(undefined);

/** Lets links anywhere in the chat add themselves to the board. */
export function AddLinkProvider({
  children,
  onAdd,
}: {
  children: ReactNode;
  onAdd?: AddLink;
}) {
  return (
    <AddLinkContext.Provider value={onAdd}>{children}</AddLinkContext.Provider>
  );
}

/**
 * Whether the board already holds this link. Read from the board itself, so
 * it holds across reloads and covers links that were there all along.
 */
function useIsOnBoard(url: string) {
  return useBoardStore((s) => {
    const target = normalizeUrl(url);
    return (
      s.nodes.some(
        (n) => n.data.kind === "link" && normalizeUrl(n.data.url) === target,
      ) ||
      s.pendingNodes.some(
        (n) =>
          n.data.preview.kind === "link" &&
          normalizeUrl(n.data.preview.url) === target,
      )
    );
  });
}

/** Links the agent suggested, each one click away from the board. */
export function LinkSuggestions({
  links,
}: {
  links: readonly LinkSuggestion[];
}) {
  return (
    <ul className="my-2 flex flex-col divide-y divide-border overflow-hidden rounded-lg border border-border">
      {links.map((link) => (
        <LinkSuggestionRow key={link.url} link={link} />
      ))}
    </ul>
  );
}

function LinkSuggestionRow({ link }: { link: LinkSuggestion }) {
  const onAdd = useContext(AddLinkContext);
  const isOnBoard = useIsOnBoard(link.url);
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

/** A small add button that sits after a link in the agent's Markdown. */
export function InlineAddLinkButton({ url }: { url: string }) {
  const onAdd = useContext(AddLinkContext);
  const isOnBoard = useIsOnBoard(url);
  if (!onAdd || !/^https?:\/\//i.test(url)) return null;

  const label = isOnBoard ? "On the board" : "Add to board";
  return (
    <Button
      aria-label={label}
      className="ml-0.5 align-middle text-muted-foreground"
      disabled={isOnBoard}
      onClick={() => onAdd(url)}
      size="icon-xs"
      title={label}
      type="button"
      variant="ghost"
    >
      {isOnBoard ? <CheckIcon /> : <PlusIcon weight="bold" />}
    </Button>
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
