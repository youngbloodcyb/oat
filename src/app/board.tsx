"use client";

import {
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type XYPosition,
} from "@xyflow/react";
import { useCallback, useEffect } from "react";
import { useShallow } from "zustand/react/shallow";
import { nodeTypes } from "@/components/nodes";
import { type BoardNodeData, useBoardStore } from "@/lib/store";

function detectFromText(text: string): BoardNodeData | null {
  let parsed: URL;
  try {
    parsed = new URL(text.trim());
  } catch {
    return null;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
  if (parsed.pathname.toLowerCase().endsWith(".pdf")) {
    const name = decodeURIComponent(
      parsed.pathname.split("/").pop() || parsed.href,
    );
    return { kind: "pdf", src: parsed.href, name };
  }
  return { kind: "link", url: parsed.href };
}

function detectFromFile(file: File): BoardNodeData | null {
  if (file.type.startsWith("image/")) {
    return { kind: "image", src: URL.createObjectURL(file), alt: file.name };
  }
  if (file.type === "application/pdf") {
    return { kind: "pdf", src: URL.createObjectURL(file), name: file.name };
  }
  return null;
}

function isEditableTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  if (el.tagName === "INPUT" || el.tagName === "TEXTAREA") return true;
  return el.isContentEditable;
}

function BoardCanvas() {
  const { nodes, onNodesChange, addNode } = useBoardStore(
    useShallow((s) => ({
      nodes: s.nodes,
      onNodesChange: s.onNodesChange,
      addNode: s.addNode,
    })),
  );
  const { screenToFlowPosition } = useReactFlow();

  const viewportCenter = useCallback(
    (): XYPosition =>
      screenToFlowPosition({
        x: window.innerWidth / 2,
        y: window.innerHeight / 2,
      }),
    [screenToFlowPosition],
  );

  useEffect(() => {
    const handler = (e: ClipboardEvent) => {
      if (isEditableTarget(e.target)) return;
      const data = e.clipboardData;
      if (!data) return;

      for (const item of data.items) {
        if (item.kind !== "file") continue;
        const file = item.getAsFile();
        if (!file) continue;
        const nodeData = detectFromFile(file);
        if (nodeData) {
          e.preventDefault();
          addNode(nodeData, viewportCenter());
          return;
        }
      }

      const text = data.getData("text/plain");
      if (!text) return;
      const nodeData = detectFromText(text);
      if (nodeData) {
        e.preventDefault();
        addNode(nodeData, viewportCenter());
      }
    };
    window.addEventListener("paste", handler);
    return () => window.removeEventListener("paste", handler);
  }, [addNode, viewportCenter]);

  const onDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
  }, []);

  const onDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      const position = screenToFlowPosition({ x: e.clientX, y: e.clientY });

      for (const file of Array.from(e.dataTransfer.files)) {
        const nodeData = detectFromFile(file);
        if (nodeData) addNode(nodeData, position);
      }

      const uriList = e.dataTransfer.getData("text/uri-list");
      if (uriList) {
        for (const line of uriList.split("\n")) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith("#")) continue;
          const nodeData = detectFromText(trimmed);
          if (nodeData) addNode(nodeData, position);
        }
      }
    },
    [addNode, screenToFlowPosition],
  );

  return (
    <div
      style={{ width: "100vw", height: "100vh" }}
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      <ReactFlow
        nodes={nodes}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        fitView
      />
    </div>
  );
}

export function Board() {
  return (
    <ReactFlowProvider>
      <BoardCanvas />
    </ReactFlowProvider>
  );
}
