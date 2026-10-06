"use client";

import type { Icon } from "@phosphor-icons/react";
import { ArticleIcon, ChatCircleIcon, PlugsIcon } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface DockMenuOption {
  name: string;
  icon: Icon;
  onSelect?: () => void;
  active?: boolean;
}

export function DockMenu({
  className,
  onAddText,
  commenting = false,
  onToggleComment,
}: {
  className?: string;
  onAddText?: () => void;
  /** Whether the comment tool is armed. */
  commenting?: boolean;
  onToggleComment?: () => void;
}) {
  const menuOptions: DockMenuOption[] = [
    {
      name: "text",
      icon: ArticleIcon,
      onSelect: onAddText,
    },
    {
      name: "comment",
      icon: ChatCircleIcon,
      onSelect: onToggleComment,
      active: commenting,
    },
    {
      name: "settings",
      icon: PlugsIcon,
    },
  ];

  return (
    <div
      className={cn(
        "fixed top-1/2 left-6 z-50 -translate-y-1/2",
        "flex flex-col items-center gap-1 rounded-lg border bg-card/80 p-1 shadow-md backdrop-blur",
        className,
      )}
    >
      {menuOptions.map(({ name, icon: IconCmp, onSelect, active }) => (
        <Button
          key={name}
          type="button"
          variant={active ? "default" : "ghost"}
          size="icon"
          aria-label={name}
          aria-pressed={active}
          title={name}
          onClick={onSelect}
        >
          <IconCmp weight={active ? "fill" : "regular"} />
        </Button>
      ))}
    </div>
  );
}
