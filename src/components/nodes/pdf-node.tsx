"use client";

import { NodeResizer, type NodeProps } from "@xyflow/react";
import type { PdfNode as PdfNodeType } from "@/lib/store";
import { cn } from "@/lib/utils";

const selectedGlow =
  "shadow-[0_0_0_2px_rgb(59_130_246),0_0_0_6px_rgb(59_130_246_/_0.25),0_0_28px_4px_rgb(59_130_246_/_0.5)]";

export function PdfNode({ data, selected }: NodeProps<PdfNodeType>) {
  return (
    <div
      className={cn(
        "relative flex h-full w-full flex-col overflow-hidden rounded-lg border bg-card text-card-foreground shadow-sm transition-shadow",
        selected && selectedGlow,
      )}
    >
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
