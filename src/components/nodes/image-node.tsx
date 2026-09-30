"use client";

import type { NodeProps } from "@xyflow/react";
import { useEffect, useState } from "react";
import { NodeShell } from "@/components/nodes/node-shell";
import type { ImageNode as ImageNodeType } from "@/lib/store";
import { cn } from "@/lib/utils";

export function ImageNode({ id, data, selected }: NodeProps<ImageNodeType>) {
  const [loaded, setLoaded] = useState(false);

  // Re-blur whenever the node's image changes; the node is only ever
  // client-rendered, so there's no hydration race to miss `onLoad` for —
  // it fires even for a cached image, just quickly.
  // biome-ignore lint/correctness/useExhaustiveDependencies: intentionally keyed on data.src alone, to reset on every src change
  useEffect(() => {
    setLoaded(false);
  }, [data.src]);

  return (
    <NodeShell
      id={id}
      selected={selected}
      minWidth={80}
      minHeight={80}
      keepAspectRatio
    >
      <div className="relative h-full w-full bg-muted">
        {/* biome-ignore lint/performance/noImgElement: blob/API-route URLs cannot use the Next image optimizer */}
        <img
          src={data.src}
          alt={data.alt ?? ""}
          onLoad={() => setLoaded(true)}
          // Tailwind's blur-* utilities compose through a CSS custom
          // property (--tw-blur) holding the whole `blur(Npx)` call, which
          // browsers don't interpolate — switching classes just snaps. Set
          // `filter` directly so its own value animates.
          style={{
            filter: loaded ? "blur(0px)" : "blur(16px)",
            transition: "filter 500ms ease-out",
          }}
          className={cn(
            "h-full w-full",
            data.fit === "contain" ? "object-contain" : "object-cover",
          )}
          draggable={false}
        />
      </div>
    </NodeShell>
  );
}
