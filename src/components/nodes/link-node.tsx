"use client";

import type { NodeProps } from "@xyflow/react";
import { useEffect, useRef } from "react";
import { NodeShell } from "@/components/nodes/node-shell";
import { useEditNodeData } from "@/hooks/use-edit-node-data";
import type { LinkNode as LinkNodeType } from "@/lib/store";

export function LinkNode({ id, data, selected }: NodeProps<LinkNodeType>) {
  const editNodeData = useEditNodeData();
  const triedRef = useRef(false);

  useEffect(() => {
    if (data.og || triedRef.current) return;
    triedRef.current = true;

    fetch(`/api/og?url=${encodeURIComponent(data.url)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((og) => {
        if (!og) return;
        editNodeData(id, { kind: "link", url: data.url, og });
      })
      .catch(() => {});
  }, [id, data.url, data.og, editNodeData]);

  let host = data.url;
  try {
    host = new URL(data.url).hostname.replace(/^www\./, "");
  } catch {}

  return (
    <NodeShell selected={selected} minWidth={160} minHeight={120}>
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
    </NodeShell>
  );
}
