"use client";

import type { Icon } from "@phosphor-icons/react";
import {
  ArrowUpRightIcon,
  FilePdfIcon,
  ImageIcon,
  LinkIcon,
  SpinnerGapIcon,
  SquaresFourIcon,
  TextTIcon,
} from "@phosphor-icons/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command";
import type { NodeType } from "@/db/schema";
import {
  type BoardSearchResults,
  type NodeSearchResult,
  searchNodesByBoard,
} from "@/services/search";

const NO_RESULTS: BoardSearchResults = { currentBoard: [], otherBoards: [] };

const nodeIcons: Record<NodeType, Icon> = {
  link: LinkIcon,
  text: TextTIcon,
  image: ImageIcon,
  pdf: FilePdfIcon,
};

export type BoardCommandAction = {
  id: string;
  label: string;
  keywords?: string[];
  icon?: Icon;
  shortcut?: string;
  onSelect: () => void;
};

type BoardCommandMenuProps = {
  boardId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelectNode: (result: NodeSearchResult) => void;
  actions?: BoardCommandAction[];
};

export function BoardCommandMenu({
  boardId,
  open,
  onOpenChange,
  onSelectNode,
  actions = [],
}: BoardCommandMenuProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<BoardSearchResults>(NO_RESULTS);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const close = useCallback(() => {
    setQuery("");
    setResults(NO_RESULTS);
    setLoading(false);
    setError(null);
    onOpenChange(false);
  }, [onOpenChange]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        event.key.toLowerCase() !== "k" ||
        (!event.metaKey && !event.ctrlKey)
      ) {
        return;
      }
      event.preventDefault();
      if (open) close();
      else onOpenChange(true);
    };

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [close, onOpenChange, open]);

  useEffect(() => {
    const normalizedQuery = query.trim();
    if (!open || !normalizedQuery) return;

    let cancelled = false;
    setLoading(true);
    setError(null);

    const timeout = window.setTimeout(() => {
      searchNodesByBoard({ query: normalizedQuery, boardId, limit: 10 })
        .then((nextResults) => {
          if (!cancelled) setResults(nextResults);
        })
        .catch(() => {
          if (!cancelled) {
            setResults(NO_RESULTS);
            setError("Node search is unavailable. Please try again.");
          }
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, 250);

    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
  }, [boardId, open, query]);

  const visibleActions = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return actions;
    return actions.filter((action) =>
      [action.label, ...(action.keywords ?? [])]
        .join(" ")
        .toLowerCase()
        .includes(normalizedQuery),
    );
  }, [actions, query]);

  const onQueryChange = (value: string) => {
    setQuery(value);
    if (!value.trim()) {
      setResults(NO_RESULTS);
      setLoading(false);
      setError(null);
    }
  };

  const hasQuery = query.trim().length > 0;
  const resultCount = results.currentBoard.length + results.otherBoards.length;
  const showNodes = hasQuery && !loading && !error && resultCount > 0;

  const selectNode = (result: NodeSearchResult) => {
    close();
    onSelectNode(result);
  };

  return (
    <CommandDialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (nextOpen) onOpenChange(true);
        else close();
      }}
      title="Board commands"
      description="Search your nodes or choose a board action."
    >
      <Command shouldFilter={false} loop>
        <CommandInput
          value={query}
          onValueChange={onQueryChange}
          placeholder="Search nodes or type a command..."
        />
        <CommandList>
          {visibleActions.length > 0 && (
            <CommandGroup heading="Actions">
              {visibleActions.map((action) => {
                const ActionIcon = action.icon;
                return (
                  <CommandItem
                    key={action.id}
                    value={`action:${action.id}`}
                    onSelect={() => {
                      close();
                      action.onSelect();
                    }}
                  >
                    {ActionIcon && <ActionIcon />}
                    <span>{action.label}</span>
                    {action.shortcut && (
                      <CommandShortcut>{action.shortcut}</CommandShortcut>
                    )}
                  </CommandItem>
                );
              })}
            </CommandGroup>
          )}

          {visibleActions.length > 0 && showNodes && <CommandSeparator />}

          {!hasQuery && visibleActions.length === 0 && (
            <div className="py-6 text-center text-xs text-muted-foreground">
              Start typing to search your nodes.
            </div>
          )}

          {hasQuery && loading && (
            <div className="flex items-center justify-center gap-2 py-6 text-xs text-muted-foreground">
              <SpinnerGapIcon className="size-3.5 animate-spin" />
              Searching nodes…
            </div>
          )}

          {hasQuery && !loading && error && (
            <div className="py-6 text-center text-xs text-destructive">
              {error}
            </div>
          )}

          {hasQuery && !loading && !error && resultCount === 0 && (
            <CommandEmpty>No nodes found.</CommandEmpty>
          )}

          {showNodes && (
            <CommandGroup heading="On this board">
              {results.currentBoard.length === 0 ? (
                <div className="px-2.5 py-2 text-xs text-muted-foreground">
                  No matches on this board.
                </div>
              ) : (
                results.currentBoard.map((result) => (
                  <NodeResultItem
                    key={result.nodeId}
                    result={result}
                    onSelect={selectNode}
                  />
                ))
              )}
            </CommandGroup>
          )}

          {showNodes && results.otherBoards.length > 0 && (
            <>
              <CommandSeparator />
              <CommandGroup heading="In other boards">
                {results.otherBoards.map((result) => (
                  <NodeResultItem
                    key={result.nodeId}
                    result={result}
                    onSelect={selectNode}
                    inOtherBoard
                  />
                ))}
              </CommandGroup>
            </>
          )}
        </CommandList>
      </Command>
    </CommandDialog>
  );
}

function NodeResultItem({
  result,
  onSelect,
  inOtherBoard = false,
}: {
  result: NodeSearchResult;
  onSelect: (result: NodeSearchResult) => void;
  inOtherBoard?: boolean;
}) {
  const NodeIcon = nodeIcons[result.type];
  return (
    <CommandItem
      value={`node:${result.nodeId}`}
      onSelect={() => onSelect(result)}
      className="items-start py-2"
    >
      <NodeIcon className="mt-0.5" />
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">{result.title}</span>
        {result.excerpt && (
          <span className="block truncate text-muted-foreground">
            {result.excerpt}
          </span>
        )}
      </span>
      {inOtherBoard && (
        <span
          className="flex max-w-[40%] shrink-0 items-center gap-1 rounded-sm border bg-muted/50 px-1.5 py-0.5 text-[10px] text-muted-foreground"
          title={`Opens ${result.boardName}`}
        >
          <SquaresFourIcon className="size-3 shrink-0" />
          <span className="truncate">{result.boardName}</span>
          <ArrowUpRightIcon className="size-3 shrink-0" />
        </span>
      )}
    </CommandItem>
  );
}
