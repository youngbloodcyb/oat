"use client";

import { ResizeIcon } from "@phosphor-icons/react";
import { NodeResizeControl } from "@xyflow/react";
import { cn } from "@/lib/utils";

const resizeControlStyle = {
  background: "transparent",
  border: "none",
  width: 32,
  height: 32,
  // Keep the handle above node content. Tiptap text content sets
  // `position: relative` on its blocks, which would otherwise paint over the
  // handle (it's earlier in the DOM) and swallow the resize drag.
  zIndex: 10,
};

const selectedGlow =
  "shadow-[0_0_0_2px_rgb(59_130_246),0_0_0_6px_rgb(59_130_246_/_0.25),0_0_28px_4px_rgb(59_130_246_/_0.5)]";

/**
 * Shared frame for every board node: the card wrapper, selection glow, and
 * resize handle. Node components supply just their own content as children.
 */
export function NodeShell({
  selected,
  minWidth,
  minHeight,
  keepAspectRatio,
  className,
  children,
}: {
  selected?: boolean;
  minWidth: number;
  minHeight: number;
  keepAspectRatio?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "relative h-full w-full overflow-hidden rounded-lg border bg-card text-card-foreground shadow-sm transition-shadow",
        selected && selectedGlow,
        className,
      )}
    >
      <NodeResizeControl
        style={resizeControlStyle}
        minWidth={minWidth}
        minHeight={minHeight}
        keepAspectRatio={keepAspectRatio}
      >
        <ResizeIcon size={12} className="text-muted-foreground" />
      </NodeResizeControl>
      {children}
    </div>
  );
}
