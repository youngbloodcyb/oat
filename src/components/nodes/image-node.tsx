"use client";

import type { NodeProps } from "@xyflow/react";
import { NodeShell } from "@/components/nodes/node-shell";
import { cn } from "@/lib/utils";
import type { ImageNode as ImageNodeType } from "@/lib/store";

export function ImageNode({ data, selected }: NodeProps<ImageNodeType>) {
  return (
    <NodeShell selected={selected} minWidth={80} minHeight={80} keepAspectRatio>
      <img
        src={data.src}
        alt={data.alt ?? ""}
        className={cn(
          "h-full w-full",
          data.fit === "contain" ? "object-contain" : "object-cover",
        )}
        draggable={false}
      />
    </NodeShell>
  );
}
