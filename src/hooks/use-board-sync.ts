import { useQuery } from "convex/react";
import { useEffect } from "react";
import { api } from "~/_generated/api";
import type { Id } from "~/_generated/dataModel";
import { toBoardNode, useBoardStore } from "@/lib/store";

/**
 * Subscribes to the board's nodes and mirrors the live query into the local
 * store. Convex is the source of truth; the store is just the interaction
 * cache React Flow renders from.
 */
export function useBoardSync(boardId: Id<"boards">) {
  const remote = useQuery(api.nodes.listByBoard, { boardId });
  const setNodes = useBoardStore((s) => s.setNodes);

  useEffect(() => {
    if (!remote) return;
    setNodes(boardId, remote.map(toBoardNode));
  }, [remote, boardId, setNodes]);

  // Ready only once the store actually holds THIS board's nodes. On a board
  // switch the store still tags the previous board, so this stays false until
  // the effect above runs — preventing a flash of the old board.
  return useBoardStore((s) => s.nodesBoardId === boardId);
}
