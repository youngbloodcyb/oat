import { useQuery } from "convex/react";
import { useEffect } from "react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
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
    setNodes(remote.map(toBoardNode));
  }, [remote, setNodes]);

  return remote === undefined; // loading
}
