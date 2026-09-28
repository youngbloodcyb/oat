"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { getRealtimeClientId } from "@/lib/realtime-client-id";
import type {
  RealtimeDurableEvent,
  RealtimePresenceMember,
  RealtimeServerEvent,
} from "@/lib/realtime-protocol";
import { toBoardNode, useBoardStore } from "@/lib/store";
import { listNodesByBoard } from "@/services/nodes";

const SEND_INTERVAL_MS = 50;
const CURSOR_STALE_MS = 15_000;

export type RemoteCursor = {
  clientId: string;
  userId: string;
  name: string;
  position: { x: number; y: number };
  updatedAt: number;
};

type ConnectionStatus = "connecting" | "online" | "offline";

function websocketUrl(boardId: string, clientId: string): string {
  const protocol = window.location.protocol === "https:" ? "wss" : "ws";
  const query = new URLSearchParams({ boardId, clientId });
  return `${protocol}://${window.location.host}/api/realtime?${query}`;
}

export function useBoardRealtime({
  boardId,
  enabled,
  canEdit,
}: {
  boardId: string;
  enabled: boolean;
  canEdit: boolean;
}) {
  const router = useRouter();
  const socketRef = useRef<WebSocket | null>(null);
  const stoppedRef = useRef(false);
  const revokedRef = useRef(false);
  const reconnectDelayRef = useRef(1_000);
  const lastVersionRef = useRef(0);
  const syncingRef = useRef(false);
  const queuedEventsRef = useRef<RealtimeDurableEvent[]>([]);
  const lastCursorSentRef = useRef(0);
  const lastDragSentRef = useRef(0);
  const [status, setStatus] = useState<ConnectionStatus>("offline");
  const [members, setMembers] = useState<RealtimePresenceMember[]>([]);
  const [cursors, setCursors] = useState<RemoteCursor[]>([]);

  const clientId = useRef<string | null>(null);
  if (typeof window !== "undefined" && !clientId.current) {
    clientId.current = getRealtimeClientId();
  }

  const applyDurableEvent = useCallback(
    (event: RealtimeDurableEvent) => {
      if (event.sourceId !== clientId.current) {
        if (event.type === "node.created" || event.type === "node.updated") {
          useBoardStore.getState().upsertRemoteNode(toBoardNode(event.node));
        } else if (event.type === "node.deleted") {
          useBoardStore.getState().removeRemoteNode(event.nodeId);
        } else if (event.type === "board.updated") {
          router.refresh();
        } else if (event.type === "board.deleted") {
          revokedRef.current = true;
          router.push("/");
        }
      }
      lastVersionRef.current = Math.max(lastVersionRef.current, event.version);
    },
    [router],
  );

  const refreshSnapshot = useCallback(
    async (baseVersion: number) => {
      if (syncingRef.current) return;
      syncingRef.current = true;
      try {
        const remote = await listNodesByBoard(boardId);
        useBoardStore.getState().setNodes(boardId, remote.map(toBoardNode));
        lastVersionRef.current = Math.max(lastVersionRef.current, baseVersion);
        const queued = queuedEventsRef.current
          .splice(0)
          .sort((a, b) => a.version - b.version);
        for (const event of queued) applyDurableEvent(event);
      } catch (error) {
        console.error("realtime snapshot refresh failed", error);
      } finally {
        syncingRef.current = false;
      }
    },
    [applyDurableEvent, boardId],
  );

  const handleDurableEvent = useCallback(
    (event: RealtimeDurableEvent) => {
      if (event.version <= lastVersionRef.current) return;
      if (syncingRef.current) {
        queuedEventsRef.current.push(event);
        return;
      }
      if (
        lastVersionRef.current > 0 &&
        event.version > lastVersionRef.current + 1
      ) {
        queuedEventsRef.current.push(event);
        void refreshSnapshot(event.version);
        return;
      }
      applyDurableEvent(event);
    },
    [applyDurableEvent, refreshSnapshot],
  );

  useEffect(() => {
    if (!enabled || !clientId.current) return;
    stoppedRef.current = false;
    revokedRef.current = false;
    const stableClientId = clientId.current;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let pingTimer: ReturnType<typeof setInterval> | null = null;

    const clearPing = () => {
      if (pingTimer) clearInterval(pingTimer);
      pingTimer = null;
    };

    const connect = () => {
      if (stoppedRef.current || revokedRef.current) return;
      setStatus("connecting");
      const socket = new WebSocket(websocketUrl(boardId, stableClientId));
      socketRef.current = socket;

      socket.addEventListener("open", () => {
        reconnectDelayRef.current = 1_000;
        setStatus("online");
        clearPing();
        pingTimer = setInterval(() => {
          if (socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({ type: "ping" }));
          }
        }, 20_000);
      });

      socket.addEventListener("message", (message) => {
        let event: RealtimeServerEvent;
        try {
          event = JSON.parse(String(message.data)) as RealtimeServerEvent;
        } catch {
          return;
        }

        if (event.type === "ready") {
          setMembers(event.members);
          queuedEventsRef.current = [];
          lastVersionRef.current = event.version;
          void refreshSnapshot(event.version);
        } else if (event.type === "presence.updated") {
          setMembers(event.members);
        } else if (event.type === "cursor.moved") {
          setCursors((current) => {
            const withoutSource = current.filter(
              (cursor) => cursor.clientId !== event.sourceId,
            );
            return event.position
              ? [
                  ...withoutSource,
                  {
                    clientId: event.sourceId,
                    userId: event.userId,
                    name: event.name,
                    position: event.position,
                    updatedAt: Date.now(),
                  },
                ]
              : withoutSource;
          });
        } else if (event.type === "nodes.dragged") {
          useBoardStore.getState().previewRemoteNodePositions(event.nodes);
        } else if (event.type === "access.changed") {
          if (event.role === null) {
            revokedRef.current = true;
            socket.close(1008, "Board access removed");
            router.push("/");
          } else {
            router.refresh();
          }
        } else if (
          event.type === "node.created" ||
          event.type === "node.updated" ||
          event.type === "node.deleted" ||
          event.type === "board.updated" ||
          event.type === "board.deleted"
        ) {
          handleDurableEvent(event);
        }
      });

      socket.addEventListener("close", (event) => {
        clearPing();
        if (socketRef.current === socket) socketRef.current = null;
        setStatus("offline");
        if (stoppedRef.current || revokedRef.current || event.code === 1008) {
          return;
        }
        reconnectTimer = setTimeout(connect, reconnectDelayRef.current);
        reconnectDelayRef.current = Math.min(
          reconnectDelayRef.current * 2,
          30_000,
        );
      });
    };

    connect();
    const cursorCleanup = setInterval(() => {
      const cutoff = Date.now() - CURSOR_STALE_MS;
      setCursors((current) =>
        current.filter((cursor) => cursor.updatedAt >= cutoff),
      );
    }, 5_000);

    return () => {
      stoppedRef.current = true;
      clearPing();
      clearInterval(cursorCleanup);
      if (reconnectTimer) clearTimeout(reconnectTimer);
      socketRef.current?.close(1000, "Board closed");
      socketRef.current = null;
      setMembers([]);
      setCursors([]);
    };
  }, [boardId, enabled, handleDurableEvent, refreshSnapshot, router]);

  const send = useCallback((event: unknown) => {
    const socket = socketRef.current;
    if (socket?.readyState !== WebSocket.OPEN) return;
    socket.send(JSON.stringify(event));
  }, []);

  const sendCursor = useCallback(
    (position: { x: number; y: number } | null) => {
      const now = Date.now();
      if (position && now - lastCursorSentRef.current < SEND_INTERVAL_MS)
        return;
      lastCursorSentRef.current = now;
      send({ type: "cursor.moved", position });
    },
    [send],
  );

  const sendDrag = useCallback(
    (nodes: Array<{ id: string; position: { x: number; y: number } }>) => {
      if (!canEdit) return;
      const now = Date.now();
      if (now - lastDragSentRef.current < SEND_INTERVAL_MS) return;
      lastDragSentRef.current = now;
      send({ type: "nodes.dragged", nodes });
    },
    [canEdit, send],
  );

  return { status, members, cursors, sendCursor, sendDrag };
}
