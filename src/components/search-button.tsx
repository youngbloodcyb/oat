"use client";

import { MagnifyingGlassIcon } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";

/** Topbar search trigger, hinting at the ⌘K shortcut that also opens it. */
export function SearchButton({ onClick }: { onClick?: () => void }) {
  return (
    <Button variant="outline" size="sm" onClick={onClick} disabled={!onClick}>
      <MagnifyingGlassIcon />
      Search
      <kbd className="ml-1 font-sans text-[0.625rem] tracking-widest text-muted-foreground">
        ⌘K
      </kbd>
    </Button>
  );
}
