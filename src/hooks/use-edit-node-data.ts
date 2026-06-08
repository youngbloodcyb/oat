import { useCallback } from "react";
import { useUpdateNodeData } from "@/hooks/use-board-actions";
import { type EditableNodeData, useBoardStore } from "@/lib/store";

/**
 * Edit a node's data with instant local feedback + persistence in one call.
 * `data` is the full payload for that kind — the update mutation replaces data
 * wholesale. Limited to link/text, whose client and stored shapes match.
 */
export function useEditNodeData() {
  const updateNodeData = useBoardStore((s) => s.updateNodeData);
  const persist = useUpdateNodeData();
  return useCallback(
    (id: string, data: EditableNodeData) => {
      updateNodeData(id, data); // instant, local
      persist(id, data); // to Convex
    },
    [updateNodeData, persist],
  );
}
