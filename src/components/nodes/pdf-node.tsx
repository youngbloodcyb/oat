"use client";

import type { NodeProps } from "@xyflow/react";
import { NodeShell } from "@/components/nodes/node-shell";
import type { PdfNode as PdfNodeType } from "@/lib/store";

export function PdfNode({ data, selected }: NodeProps<PdfNodeType>) {
  return (
    <NodeShell
      selected={selected}
      minWidth={200}
      minHeight={200}
      className="flex flex-col"
    >
      <div className="truncate border-b bg-muted px-3 py-2 text-xs font-medium">
        {data.name}
      </div>
      <embed
        src={data.src}
        type="application/pdf"
        className="nodrag flex-1 bg-white"
      />
    </NodeShell>
  );
}
