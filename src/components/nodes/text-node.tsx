"use client";

import type { NodeProps } from "@xyflow/react";
import { NodeShell } from "@/components/nodes/node-shell";
import type { TextNode as TextNodeType } from "@/lib/store";

// Read-only on the canvas. Editing happens in the drawer (dock → "Edit text").
// `data.text` holds HTML; the `.tiptap.ProseMirror` classes apply the same
// typography styles as the editor (loaded via the SimpleEditor module).
export function TextNode({ data, selected }: NodeProps<TextNodeType>) {
  return (
    <NodeShell selected={selected} minWidth={120} minHeight={80}>
      {data.text ? (
        <div
          className="tiptap ProseMirror h-full w-full overflow-auto p-3 text-sm"
          // biome-ignore lint/security/noDangerouslySetInnerHtml: editor-authored HTML
          dangerouslySetInnerHTML={{ __html: data.text }}
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center p-3 text-sm text-muted-foreground">
          Empty
        </div>
      )}
    </NodeShell>
  );
}
