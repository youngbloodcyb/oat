import { useReactFlow, type XYPosition } from "@xyflow/react";
import { useCallback, useEffect } from "react";
import {
  detectFromFile,
  detectFromText,
  isEditableTarget,
} from "@/lib/board-utils";
import { useBoardStore } from "@/lib/store";

export function useCanvasInputs() {
  const addNode = useBoardStore((s) => s.addNode);
  const { screenToFlowPosition } = useReactFlow();

  const viewportCenter = useCallback(
    (): XYPosition =>
      screenToFlowPosition({
        x: window.innerWidth / 2,
        y: window.innerHeight / 2,
      }),
    [screenToFlowPosition],
  );

  useEffect(() => {
    const handler = (e: ClipboardEvent) => {
      if (isEditableTarget(e.target)) return;
      const data = e.clipboardData;
      if (!data) return;

      for (const item of data.items) {
        if (item.kind !== "file") continue;
        const file = item.getAsFile();
        if (!file) continue;
        const nodeData = detectFromFile(file);
        if (nodeData) {
          e.preventDefault();
          addNode(nodeData, viewportCenter());
          return;
        }
      }

      const text = data.getData("text/plain");
      if (!text) return;
      const nodeData = detectFromText(text);
      if (nodeData) {
        e.preventDefault();
        addNode(nodeData, viewportCenter());
      }
    };
    window.addEventListener("paste", handler);
    return () => window.removeEventListener("paste", handler);
  }, [addNode, viewportCenter]);

  const onDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
  }, []);

  const onDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      const position = screenToFlowPosition({ x: e.clientX, y: e.clientY });

      for (const file of Array.from(e.dataTransfer.files)) {
        const nodeData = detectFromFile(file);
        if (nodeData) addNode(nodeData, position);
      }

      const uriList = e.dataTransfer.getData("text/uri-list");
      if (uriList) {
        for (const line of uriList.split("\n")) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith("#")) continue;
          const nodeData = detectFromText(trimmed);
          if (nodeData) addNode(nodeData, position);
        }
      }
    },
    [addNode, screenToFlowPosition],
  );

  return { onDragOver, onDrop };
}
