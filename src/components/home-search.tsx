"use client";

import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { BoardCommandMenu } from "@/components/board-command-menu";
import { SearchButton } from "@/components/search-button";
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
      <SearchButton onClick={() => setOpen(true)} />
      <BoardCommandMenu
        open={open}
        onOpenChange={setOpen}
        onSelectNode={onSelectNode}
      />
    </>
  );
}
