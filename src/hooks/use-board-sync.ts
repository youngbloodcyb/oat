import { useMutation, useQuery } from "convex/react";
import { useEffect, useRef, useState } from "react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { toBoardNode, useBoardStore } from "@/lib/store";

/**
 * Resolves the board to show, creating a default one for the user if they
 * have none. Returns `null` until a board id is known.
 */
export function useDefaultBoard(): Id<"boards"> | null {
  const ensureDefault = useMutation(api.boards.ensureDefault);
  const [boardId, setBoardId] = useState<Id<"boards"> | null>(null);
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    ensureDefault()
      .then(setBoardId)
      .catch(() => {
        ran.current = false;
      });
  }, [ensureDefault]);

  return boardId;
}

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
