"use client";

import type { NodeProps } from "@xyflow/react";
import { NodeShell } from "@/components/nodes/node-shell";
import type { ImageNode as ImageNodeType } from "@/lib/store";

export function ImageNode({ data, selected }: NodeProps<ImageNodeType>) {
  return (
    <NodeShell selected={selected} minWidth={80} minHeight={80} keepAspectRatio>
      <img
        src={data.src}
        alt={data.alt ?? ""}
        className="h-full w-full object-cover"
        draggable={false}
      />
    </NodeShell>
  );
}
