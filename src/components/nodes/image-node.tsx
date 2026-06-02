"use client";

import { ArrowDownRightIcon } from "@phosphor-icons/react";
import { NodeResizeControl, type NodeProps } from "@xyflow/react";
import type { ImageNode as ImageNodeType } from "@/lib/store";
import { cn } from "@/lib/utils";

const selectedGlow =
  "shadow-[0_0_0_2px_rgb(59_130_246),0_0_0_6px_rgb(59_130_246_/_0.25),0_0_28px_4px_rgb(59_130_246_/_0.5)]";

const resizeControlStyle = {
  background: "transparent",
  border: "none",
  width: 32,
  height: 32,
};

export function ImageNode({ data, selected }: NodeProps<ImageNodeType>) {
  return (
    <div
      className={cn(
        "relative h-full w-full overflow-hidden rounded-lg border bg-card shadow-sm transition-shadow",
        selected && selectedGlow,
      )}
    >
      <NodeResizeControl
        style={resizeControlStyle}
        minWidth={80}
        minHeight={80}
        keepAspectRatio
      >
        <ArrowDownRightIcon size={12} className="text-muted-foreground" />
      </NodeResizeControl>
      <img
        src={data.src}
        alt={data.alt ?? ""}
        className="h-full w-full object-cover"
        draggable={false}
      />
    </div>
  );
}
