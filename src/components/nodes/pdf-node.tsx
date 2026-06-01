"use client";

import { NodeResizer, type NodeProps } from "@xyflow/react";
import type { PdfNode as PdfNodeType } from "@/lib/store";

export function PdfNode({ data, selected }: NodeProps<PdfNodeType>) {
  return (
    <div className="relative flex h-full w-full flex-col overflow-hidden rounded-lg border bg-card text-card-foreground shadow-sm">
      <NodeResizer isVisible={selected} minWidth={200} minHeight={200} />
      <div className="truncate border-b bg-muted px-3 py-2 text-xs font-medium">
        {data.name}
      </div>
      <embed
        src={data.src}
        type="application/pdf"
        className="nodrag flex-1 bg-white"
      />
    </div>
  );
}
