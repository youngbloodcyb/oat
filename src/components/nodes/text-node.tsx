"use client";

import type { NodeProps } from "@xyflow/react";
import { useEffect, useState } from "react";
import { NodeShell } from "@/components/nodes/node-shell";
import { useUpdateNodeData } from "@/hooks/use-board-actions";
import { type TextNode as TextNodeType, useBoardStore } from "@/lib/store";

export function TextNode({ id, data, selected }: NodeProps<TextNodeType>) {
  const updateNodeData = useBoardStore((s) => s.updateNodeData);
  const persistNodeData = useUpdateNodeData();
  const [value, setValue] = useState(data.text);

  // Stay in sync if the text changes server-side (e.g. another client).
  useEffect(() => {
    setValue(data.text);
  }, [data.text]);

  const commit = () => {
    if (value === data.text) return;
    updateNodeData<TextNodeType["data"]>(id, { text: value }); // instant, local
    persistNodeData(id, { kind: "text", text: value }); // to Convex
  };

  return (
    <NodeShell selected={selected} minWidth={120} minHeight={80}>
      <textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={commit}
        placeholder="Type something…"
        className="nodrag h-full w-full resize-none bg-transparent p-3 text-sm outline-none"
      />
    </NodeShell>
  );
}
