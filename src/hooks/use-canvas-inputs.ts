import { useReactFlow, type XYPosition } from "@xyflow/react";
import { useCallback, useEffect } from "react";
import { useBoardActions } from "@/hooks/use-board-actions";
import {
  detectFromFile,
  detectFromText,
  isEditableTarget,
} from "@/lib/board-utils";

export function useCanvasInputs(boardId: string, enabled = true) {
  const { addDraft } = useBoardActions(boardId);
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
    if (!enabled) return;
    const handler = (e: ClipboardEvent) => {
      if (isEditableTarget(e.target)) return;
      const data = e.clipboardData;
      if (!data) return;

      for (const item of data.items) {
        if (item.kind !== "file") continue;
        const file = item.getAsFile();
        if (!file) continue;
        const draft = detectFromFile(file);
        if (draft) {
          e.preventDefault();
          addDraft(draft, viewportCenter());
          return;
        }
      }

      const text = data.getData("text/plain");
      if (!text) return;
      const draft = detectFromText(text);
      if (draft) {
        e.preventDefault();
        addDraft(draft, viewportCenter());
      }
    };
    window.addEventListener("paste", handler);
    return () => window.removeEventListener("paste", handler);
  }, [addDraft, enabled, viewportCenter]);

  const onDragOver = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      if (!enabled) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
    },
    [enabled],
  );

  const onDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      if (!enabled) return;
      e.preventDefault();
      const position = screenToFlowPosition({ x: e.clientX, y: e.clientY });

      for (const file of Array.from(e.dataTransfer.files)) {
        const draft = detectFromFile(file);
        if (draft) addDraft(draft, position);
      }

      const uriList = e.dataTransfer.getData("text/uri-list");
      if (uriList) {
        for (const line of uriList.split("\n")) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith("#")) continue;
          const draft = detectFromText(trimmed);
          if (draft) addDraft(draft, position);
        }
      }
    },
    [addDraft, enabled, screenToFlowPosition],
  );

  return { onDragOver, onDrop, viewportCenter };
}
