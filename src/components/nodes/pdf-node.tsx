"use client";

import type { NodeProps } from "@xyflow/react";
import { useEffect, useState } from "react";
import { NodeShell } from "@/components/nodes/node-shell";
import type { PdfNode as PdfNodeType } from "@/lib/store";

export function PdfNode({ id, data, selected }: NodeProps<PdfNodeType>) {
  const [embedSrc, setEmbedSrc] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  // Fetch the PDF's full bytes ourselves before rendering the embed at all,
  // so the blur only clears once it has actually finished downloading —
  // the embed's own `load` event fires as soon as its viewer frame is up,
  // well before a large PDF has actually finished loading.
  useEffect(() => {
    setLoaded(false);
    setEmbedSrc(null);
    if (!data.src) return;

    let cancelled = false;
    let objectUrl: string | null = null;

    fetch(data.src)
      .then((res) => res.blob())
      .then((blob) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setEmbedSrc(objectUrl);
      })
      .catch(() => {
        if (!cancelled) setEmbedSrc(data.src);
      });

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [data.src]);

  // Mount the embed blurred first, then flip to sharp a couple frames later
  // — setting both in the same tick as setEmbedSrc would create the element
  // already unblurred, with no prior painted frame for the transition to
  // animate from, so it'd just snap instead of animating. Double rAF so the
  // blurred state has definitely been painted before we switch it.
  useEffect(() => {
    if (!embedSrc) return;
    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => setLoaded(true));
    });
    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
    };
  }, [embedSrc]);

  return (
    <NodeShell
      id={id}
      selected={selected}
      minWidth={200}
      minHeight={200}
      className="flex flex-col"
    >
      <div className="truncate border-b bg-muted px-3 py-2 text-xs font-medium">
        {data.name}
      </div>
      <div className="relative flex-1 bg-muted">
        {embedSrc && (
          <embed
            src={embedSrc}
            type="application/pdf"
            className="nodrag h-full w-full bg-white"
            style={{
              filter: loaded ? "blur(0px)" : "blur(12px)",
              transition: "filter 800ms ease-out",
            }}
          />
        )}
      </div>
    </NodeShell>
  );
}
