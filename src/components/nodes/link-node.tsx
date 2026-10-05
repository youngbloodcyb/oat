"use client";

import { GlobeIcon } from "@phosphor-icons/react";
import type { NodeProps } from "@xyflow/react";
import { type CSSProperties, useEffect, useRef, useState } from "react";
import { useBoardPermissions } from "@/components/board-permissions";
import { NodeShell } from "@/components/nodes/node-shell";
import { useEditNodeData } from "@/hooks/use-edit-node-data";
import type { LinkNode as LinkNodeType, OgMeta } from "@/lib/store";

export function LinkNode({ id, data, selected }: NodeProps<LinkNodeType>) {
  const { canEdit } = useBoardPermissions();
  const editNodeData = useEditNodeData();
  const triedRef = useRef(false);
  const [imageFailed, setImageFailed] = useState(false);

  useEffect(() => {
    if (!canEdit || data.og || triedRef.current) return;
    triedRef.current = true;

    fetch(`/api/og?url=${encodeURIComponent(data.url)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((og) => {
        if (!og) return;
        editNodeData(id, { kind: "link", url: data.url, og });
      })
      .catch(() => {});
  }, [canEdit, id, data.url, data.og, editNodeData]);

  const { host, path } = splitUrl(data.url);

  return (
    <NodeShell id={id} selected={selected} minWidth={160} minHeight={120}>
      {data.og?.image && !imageFailed ? (
        <img
          src={data.og.image}
          alt=""
          className="h-32 w-full object-cover"
          onError={() => setImageFailed(true)}
        />
      ) : (
        <LinkPreviewFallback host={host} path={path} og={data.og} />
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

/**
 * Stands in for a missing preview image: the site's icon over a wash of its
 * theme color, with the domain and path so the card still says where it goes.
 */
function LinkPreviewFallback({
  host,
  path,
  og,
}: {
  host: string;
  path: string;
  og?: OgMeta;
}) {
  const [iconFailed, setIconFailed] = useState(false);
  const style: CSSProperties | undefined = og?.themeColor
    ? {
        backgroundColor: `color-mix(in oklab, ${og.themeColor} 18%, var(--muted))`,
      }
    : undefined;

  return (
    <div
      className="flex h-32 w-full flex-col items-center justify-center gap-2 bg-muted px-4 text-center"
      style={style}
    >
      {og?.icon && !iconFailed ? (
        <img
          src={og.icon}
          alt=""
          className="size-10 rounded-lg bg-background object-contain p-1 shadow-xs"
          onError={() => setIconFailed(true)}
        />
      ) : (
        <span className="flex size-10 items-center justify-center rounded-lg bg-background shadow-xs">
          <GlobeIcon className="size-5 text-muted-foreground" />
        </span>
      )}
      <div className="w-full min-w-0">
        <div className="truncate text-xs font-medium">{host}</div>
        {path && (
          <div className="truncate text-[11px] text-muted-foreground">
            {path}
          </div>
        )}
      </div>
    </div>
  );
}

function splitUrl(url: string): { host: string; path: string } {
  try {
    const parsed = new URL(url);
    const path = `${parsed.pathname}${parsed.search}`.replace(/\/$/, "");
    return { host: parsed.hostname.replace(/^www\./, ""), path };
  } catch {
    return { host: url, path: "" };
  }
}
