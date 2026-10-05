"use client";

import { MagnifyingGlassIcon } from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { BoardCommandMenu } from "@/components/board-command-menu";
import { Button } from "@/components/ui/button";
import type { NodeSearchResult } from "@/services/search";

/** Topbar search for the boards page: finds nodes across every board. */
export function HomeSearch() {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  const onSelectNode = useCallback(
    (result: NodeSearchResult) => {
      router.push(
        `/${encodeURIComponent(result.boardId)}?node=${encodeURIComponent(result.nodeId)}`,
      );
    },
    [router],
  );

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <MagnifyingGlassIcon />
        Search
      </Button>
      <BoardCommandMenu
        open={open}
        onOpenChange={setOpen}
        onSelectNode={onSelectNode}
      />
    </>
  );
}
