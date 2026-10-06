"use client";

import { XIcon } from "@phosphor-icons/react";
import { nodeIcons } from "@/components/node-icons";
import { type SelectionItem, selectedItems } from "@/lib/chat-selection";
import { useBoardStore } from "@/lib/store";
import { cn } from "@/lib/utils";

function SelectionChip({
  item,
  onClick,
  onRemove,
}: {
  item: SelectionItem;
  onClick?: () => void;
  onRemove?: () => void;
}) {
  const NodeIcon = nodeIcons[item.type];
  const label = (
    <>
      <NodeIcon className="size-3 shrink-0 text-muted-foreground" />
      <span className="truncate">{item.title}</span>
    </>
  );
  return (
    <span className="inline-flex h-6 max-w-48 items-center gap-1 rounded-md border bg-card px-1.5 text-xs">
      {onClick ? (
        <button
          className="flex min-w-0 items-center gap-1 hover:underline"
          onClick={onClick}
          title={item.title}
          type="button"
        >
          {label}
        </button>
      ) : (
        <span className="flex min-w-0 items-center gap-1" title={item.title}>
          {label}
        </span>
      )}
      {onRemove && (
        <button
          aria-label={`Deselect ${item.title}`}
          className="-mr-0.5 shrink-0 rounded-sm p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
          onClick={onRemove}
          type="button"
        >
          <XIcon className="size-2.5" />
        </button>
      )}
    </span>
  );
}

export function SelectionChips({
  className,
  items,
  onSelectItem,
  onRemoveItem,
}: {
  className?: string;
  items: readonly SelectionItem[];
  onSelectItem?: (item: SelectionItem) => void;
  onRemoveItem?: (item: SelectionItem) => void;
}) {
  if (items.length === 0) return null;
  return (
    <div className={cn("flex flex-wrap gap-1", className)}>
      {items.map((item) => (
        <SelectionChip
          item={item}
          key={item.id}
          onClick={onSelectItem && (() => onSelectItem(item))}
          onRemove={onRemoveItem && (() => onRemoveItem(item))}
        />
      ))}
    </div>
  );
}

/**
 * The board's current selection, shown in the composer: these items go with
 * the next message. Its own component so dragging nodes around re-renders
 * just this, not the whole chat.
 */
export function ComposerSelection() {
  const nodes = useBoardStore((s) => s.nodes);
  return (
    <SelectionChips
      className="px-2.5 pt-2.5"
      items={selectedItems(nodes)}
      onRemoveItem={(item) =>
        useBoardStore
          .getState()
          .onNodesChange([{ type: "select", id: item.id, selected: false }])
      }
    />
  );
}
