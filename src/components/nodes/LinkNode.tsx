"use client";

import { Handle, type NodeProps, Position } from "@xyflow/react";
import { useEffect, useRef } from "react";
import { type LinkNode as LinkNodeType, useBoardStore } from "@/lib/store";

export function LinkNode({ id, data }: NodeProps<LinkNodeType>) {
  const updateNodeData = useBoardStore((s) => s.updateNodeData);
  const triedRef = useRef(false);

  useEffect(() => {
    if (data.og || triedRef.current) return;
    triedRef.current = true;

    const controller = new AbortController();
    fetch(`/api/og?url=${encodeURIComponent(data.url)}`, {
      signal: controller.signal,
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((og) => {
        if (og) updateNodeData<LinkNodeType["data"]>(id, { og });
      })
      .catch(() => {});

    return () => controller.abort();
  }, [id, data.url, data.og, updateNodeData]);

  let host = data.url;
  try {
    host = new URL(data.url).hostname.replace(/^www\./, "");
  } catch {}

  return (
    <div className="w-64 overflow-hidden rounded-lg border bg-card text-card-foreground shadow-sm">
      <Handle type="target" position={Position.Top} />
      {data.og?.image && (
        <img
          src={data.og.image}
          alt=""
          className="h-32 w-full object-cover"
        />
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
          className="block truncate text-xs text-muted-foreground hover:text-foreground"
        >
          {data.og?.siteName ?? host}
        </a>
      </div>
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}
