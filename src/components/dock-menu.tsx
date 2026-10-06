"use client";

import type { Icon } from "@phosphor-icons/react";
import { ArticleIcon, FadersIcon, GearIcon } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface DockMenuOption {
  name: string;
  icon: Icon;
  onSelect?: () => void;
}

const options: DockMenuOption[] = [
  {
    name: "properties",
    icon: FadersIcon,
  },
  {
    name: "settings",
    icon: GearIcon,
  },
];

export function DockMenu({
  className,
  onAddText,
}: {
  className?: string;
  onAddText?: () => void;
}) {
  const menuOptions: DockMenuOption[] = [
    {
      name: "text",
      icon: ArticleIcon,
      onSelect: onAddText,
    },
    ...options,
  ];

  return (
    <div
      className={cn(
        "fixed top-1/2 left-6 z-50 -translate-y-1/2",
        "flex flex-col items-center gap-1 rounded-lg border bg-card/80 p-1 shadow-md backdrop-blur",
        className,
      )}
    >
      {menuOptions.map(({ name, icon: IconCmp, onSelect }) => (
        <Button
          key={name}
          type="button"
          variant="ghost"
          size="icon"
          aria-label={name}
          title={name}
          onClick={onSelect}
        >
          <IconCmp />
        </Button>
      ))}
    </div>
  );
}
