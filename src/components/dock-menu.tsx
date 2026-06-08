"use client";

import type { Icon } from "@phosphor-icons/react";
import {
  FadersIcon,
  PersonIcon,
  GearIcon,
  BinocularsIcon,
} from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface DockMenuOption {
  name: string;
  icon: Icon;
  onSelect?: () => void;
}

const options: DockMenuOption[] = [
  {
    name: "search",
    icon: BinocularsIcon,
  },
  {
    name: "share",
    icon: PersonIcon,
  },
  {
    name: "properties",
    icon: FadersIcon,
  },
  {
    name: "settings",
    icon: GearIcon,
  },
];

export function DockMenu({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "fixed bottom-6 left-1/2 z-50 -translate-x-1/2",
        "flex items-center gap-1 rounded-lg border bg-card/80 p-1 shadow-md backdrop-blur",
        className,
      )}
    >
      {options.map(({ name, icon: IconCmp, onSelect }) => (
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
