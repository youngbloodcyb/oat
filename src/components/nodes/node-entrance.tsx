"use client";

import { createContext, type ReactNode, useContext, useState } from "react";

const STAGGER_MS = 45;
const MAX_DELAY_MS = 900;

/**
 * Which nodes should play the entrance animation, and with what delay.
 * Captured once, from whatever nodes exist the moment this provider first
 * mounts — which only happens right as the board finishes loading (see
 * `BoardCanvas`'s `!ready` gate) — so later node creation/edits don't
 * replay it.
 */
const NodeEntranceContext = createContext<Map<string, number> | null>(null);

export function NodeEntranceProvider({
  nodeIds,
  children,
}: {
  nodeIds: string[];
  children: ReactNode;
}) {
  const [entranceMap] = useState(() => {
    const map = new Map<string, number>();
    nodeIds.forEach((id, index) => {
      map.set(id, Math.min(index * STAGGER_MS, MAX_DELAY_MS));
    });
    return map;
  });

  return (
    <NodeEntranceContext.Provider value={entranceMap}>
      {children}
    </NodeEntranceContext.Provider>
  );
}

/** Entrance delay in ms for this node, or null if it shouldn't animate in. */
export function useNodeEntranceDelay(nodeId: string): number | null {
  const map = useContext(NodeEntranceContext);
  const delay = map?.get(nodeId);
  return delay === undefined ? null : delay;
}
