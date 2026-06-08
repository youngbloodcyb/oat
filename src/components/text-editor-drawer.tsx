"use client";

import { useEffect, useRef } from "react";
import { SimpleEditor } from "@/components/tiptap/simple/simple-editor";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { useEditNodeData } from "@/hooks/use-edit-node-data";
import { useBoardStore } from "@/lib/store";

/**
 * Full Tiptap editor for a text node, in a bottom drawer. Opened via the node
 * dock's "Edit text" action; autosaves the HTML back to the node on close.
 */
export function TextEditorDrawer() {
  const editingId = useBoardStore((s) => s.editingTextNodeId);
  const closeTextEditor = useBoardStore((s) => s.closeTextEditor);
  const nodes = useBoardStore((s) => s.nodes);
  const editNodeData = useEditNodeData();

  const node = editingId ? nodes.find((n) => n.id === editingId) : null;
  const open = !!node && node.data.kind === "text";
  const initialHtml = node?.data.kind === "text" ? node.data.text : "";

  // Latest HTML from the editor, persisted when the drawer closes.
  const htmlRef = useRef(initialHtml);
  useEffect(() => {
    htmlRef.current = initialHtml;
  }, [initialHtml]);

  const onOpenChange = (next: boolean) => {
    if (next) return;
    if (editingId) editNodeData(editingId, { kind: "text", text: htmlRef.current });
    closeTextEditor();
  };

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="h-[85vh]">
        <DrawerHeader className="sr-only">
          <DrawerTitle>Edit text</DrawerTitle>
        </DrawerHeader>
        <div className="min-h-0 flex-1 overflow-auto">
          {open && (
            <SimpleEditor
              key={editingId}
              content={initialHtml}
              onChange={(html) => {
                htmlRef.current = html;
              }}
            />
          )}
        </div>
      </DrawerContent>
    </Drawer>
  );
}
