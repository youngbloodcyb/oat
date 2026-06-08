"use client";

import { useEffect, useState } from "react";
import { actionsFor, type ActionCtx } from "@/components/node-actions";
import { Button } from "@/components/ui/button";
import { useBoardActions } from "@/hooks/use-board-actions";
import { useEditNodeData } from "@/hooks/use-edit-node-data";
import { useBoardStore } from "@/lib/store";
import { cn } from "@/lib/utils";
import type { Id } from "~/_generated/dataModel";

/**
 * Vertical, right-side dock of actions for the selected node. Visible only when
 * exactly one node is selected; the available icons depend on the node's kind.
 */
export function NodeDock({ boardId }: { boardId: Id<"boards"> }) {
  const selectedNode = useBoardStore((s) => s.selectedNode);
  const openTextEditor = useBoardStore((s) => s.openTextEditor);
  const openImageCrop = useBoardStore((s) => s.openImageCrop);
  const { removeNode, duplicateNode, bringToFront } = useBoardActions(boardId);
  const editData = useEditNodeData();

  // Retain the last selected node while sliding out so the icons don't vanish
  // mid-animation when selection clears.
  const [shownNode, setShownNode] = useState(selectedNode);
  useEffect(() => {
    if (selectedNode) setShownNode(selectedNode);
  }, [selectedNode]);

  const visible = selectedNode !== null;
  const node = selectedNode ?? shownNode;
  const actions = node ? actionsFor(node) : [];

  return (
    <div
      className={cn(
        "fixed right-6 top-1/2 z-40 -translate-y-1/2",
        "flex flex-col items-center gap-1 rounded-lg border bg-card/80 p-1 shadow-md backdrop-blur",
        "transition-all duration-200 ease-out",
        visible
          ? "translate-x-0 opacity-100"
          : "pointer-events-none translate-x-4 opacity-0",
      )}
    >
      {actions.map((action) => (
        <Button
          key={action.name}
          type="button"
          variant="ghost"
          size="icon"
          aria-label={action.name}
          title={action.name}
          className={cn(
            "transition-transform duration-200 ease-out hover:scale-125 hover:bg-transparent",
            action.danger && "text-destructive",
          )}
          onClick={() => {
            if (!node) return;
            const ctx: ActionCtx = {
              node,
              remove: removeNode,
              duplicate: duplicateNode,
              bringToFront,
              editData,
              openTextEditor,
              openImageCrop,
            };
            action.run(ctx);
          }}
        >
          <action.icon />
        </Button>
      ))}
    </div>
  );
}
