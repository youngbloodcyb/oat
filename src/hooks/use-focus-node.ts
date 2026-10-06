import { useReactFlow } from "@xyflow/react";
import { useCallback } from "react";
import { type CanvasNode, useBoardStore } from "@/lib/store";

/**
 * Selects a node and pans the canvas to it. Returns false when the node
 * isn't on the board (anymore).
 */
export function useFocusNode() {
  const { fitView } = useReactFlow<CanvasNode>();
  return useCallback(
    (nodeId: string) => {
      if (!useBoardStore.getState().selectNode(nodeId)) return false;
      window.requestAnimationFrame(() => {
        void fitView({
          nodes: [{ id: nodeId }],
          padding: 0.5,
          maxZoom: 1.25,
          duration: 350,
        });
      });
      return true;
    },
    [fitView],
  );
}
