"use client";

import type { NodeProps } from "@xyflow/react";
import { useEffect, useState } from "react";
import { NodeShell } from "@/components/nodes/node-shell";
import { useEditNodeData } from "@/hooks/use-edit-node-data";
import type { TextNode as TextNodeType } from "@/lib/store";

export function TextNode({ id, data, selected }: NodeProps<TextNodeType>) {
  const editNodeData = useEditNodeData();
  const [value, setValue] = useState(data.text);

  // Stay in sync if the text changes server-side (e.g. another client).
  useEffect(() => {
    setValue(data.text);
  }, [data.text]);

  const commit = () => {
    if (value === data.text) return;
    editNodeData(id, { kind: "text", text: value });
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
