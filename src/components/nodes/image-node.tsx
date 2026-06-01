"use client";

import { NodeResizer, type NodeProps } from "@xyflow/react";
import type { ImageNode as ImageNodeType } from "@/lib/store";

export function ImageNode({ data, selected }: NodeProps<ImageNodeType>) {
  return (
    <div className="relative h-full w-full overflow-hidden rounded-lg border bg-card shadow-sm">
      <NodeResizer
        isVisible={selected}
        minWidth={80}
        minHeight={80}
        keepAspectRatio
      />
      <img
        src={data.src}
        alt={data.alt ?? ""}
        className="h-full w-full object-cover"
        draggable={false}
      />
    </div>
  );
}
