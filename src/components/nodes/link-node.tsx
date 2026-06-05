"use client";

import { ResizeIcon } from "@phosphor-icons/react";
import { NodeResizeControl, type NodeProps } from "@xyflow/react";
import { useEffect, useRef } from "react";
import { useUpdateNodeData } from "@/hooks/use-board-actions";
import { type LinkNode as LinkNodeType, useBoardStore } from "@/lib/store";
import { cn } from "@/lib/utils";

const resizeControlStyle = {
  background: "transparent",
  border: "none",
  width: 32,
  height: 32,
};

const selectedGlow =
  "shadow-[0_0_0_2px_rgb(59_130_246),0_0_0_6px_rgb(59_130_246_/_0.25),0_0_28px_4px_rgb(59_130_246_/_0.5)]";

export function LinkNode({ id, data, selected }: NodeProps<LinkNodeType>) {
  const updateNodeData = useBoardStore((s) => s.updateNodeData);
  const persistNodeData = useUpdateNodeData();
  const triedRef = useRef(false);

  useEffect(() => {
    if (data.og || triedRef.current) return;
    triedRef.current = true;

    fetch(`/api/og?url=${encodeURIComponent(data.url)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((og) => {
        if (!og) return;
        updateNodeData<LinkNodeType["data"]>(id, { og }); // instant, local
        persistNodeData(id, { kind: "link", url: data.url, og }); // to Convex
      })
      .catch(() => {});
  }, [id, data.url, data.og, updateNodeData, persistNodeData]);

  let host = data.url;
  try {
    host = new URL(data.url).hostname.replace(/^www\./, "");
  } catch {}

  return (
    <div
      className={cn(
        "relative h-full w-full overflow-hidden rounded-lg border bg-card text-card-foreground shadow-sm transition-shadow",
        selected && selectedGlow,
      )}
    >
      <NodeResizeControl
        style={resizeControlStyle}
        minWidth={160}
        minHeight={120}
      >
        <ResizeIcon size={12} className="text-muted-foreground" />
      </NodeResizeControl>
      {data.og?.image && (
        <img src={data.og.image} alt="" className="h-32 w-full object-cover" />
      )}
      <div className="space-y-1 p-3">
        {data.og?.title && (
          <div className="line-clamp-2 text-sm font-medium">
            {data.og.title}
          </div>
        )}
        {data.og?.description && (
          <div className="line-clamp-2 text-xs text-muted-foreground">
            {data.og.description}
          </div>
        )}
        <a
          href={data.url}
          target="_blank"
          rel="noopener noreferrer"
          className="block cursor-pointer truncate text-xs text-muted-foreground hover:text-foreground"
        >
          {data.og?.siteName ?? host}
        </a>
      </div>
    </div>
  );
}
