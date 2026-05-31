"use client";

import {
  Handle,
  NodeResizer,
  type NodeProps,
  Position,
} from "@xyflow/react";
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
      <Handle type="target" position={Position.Top} />
      <img
        src={data.src}
        alt={data.alt ?? ""}
        className="h-full w-full object-cover"
        draggable={false}
      />
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}
