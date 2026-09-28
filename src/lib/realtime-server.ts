import "server-only";

import type { RawData, WebSocket } from "ws";
import {
  type RealtimeAccessEvent,
  type RealtimeBusEvent,
  type RealtimeClientEvent,
  type RealtimePresenceMember,
  type RealtimeServerEvent,
  realtimeClientEventSchema,
} from "@/lib/realtime-protocol";
import {
  createRealtimeSubscriber,
  getBoardRealtimeVersion,
  getRealtimeRedis,
  publishRealtimeBusEvent,
  realtimeBoardChannelPattern,
  realtimePresenceHashKey,
  realtimePresenceSetKey,
} from "@/lib/realtime-redis";
import type { BoardAccessRole } from "@/services/board-access";

const HEARTBEAT_MS = 20_000;
const CONNECTION_STALE_MS = 70_000;
const PRESENCE_STALE_MS = 60_000;

type ConnectionIdentity = {
  boardId: string;
  clientId: string;
  userId: string;
  name: string;
  image: string | null;
  role: BoardAccessRole;
};

type ConnectionRecord = ConnectionIdentity & {
  ws: WebSocket;
  presenceId: string;
  lastSeenAt: number;
  lastCursorAt: number;
  lastDragAt: number;
  closed: boolean;
};

type PresenceDetails = Omit<ConnectionIdentity, "boardId">;

type RealtimeHub = {
  instanceId: string;
  connections: Map<WebSocket, ConnectionRecord>;
  subscriber: ReturnType<typeof createRealtimeSubscriber>;
  subscriberStart: Promise<void> | null;
  heartbeat: ReturnType<typeof setInterval> | null;
};

const globalForRealtime = globalThis as typeof globalThis & {
  oatRealtimeHub?: RealtimeHub;
};

function createHub(): RealtimeHub {
  return {
    instanceId: crypto.randomUUID(),
    connections: new Map(),
    subscriber: null,
    subscriberStart: null,
    heartbeat: null,
  };
}

if (!globalForRealtime.oatRealtimeHub) {
  globalForRealtime.oatRealtimeHub = createHub();
}
const hub = globalForRealtime.oatRealtimeHub;

function safeSend(ws: WebSocket, event: RealtimeServerEvent): void {
  if (ws.readyState !== 1) return;
  try {
    ws.send(JSON.stringify(event));
  } catch (error) {
    console.error("realtime socket send failed", { type: event.type, error });
  }
}

function boardConnections(boardId: string): ConnectionRecord[] {
  return [...hub.connections.values()].filter(
    (connection) => !connection.closed && connection.boardId === boardId,
  );
}

function localPresenceMembers(boardId: string): RealtimePresenceMember[] {
  return aggregatePresence(
    boardConnections(boardId).map((connection) => ({
      userId: connection.userId,
      name: connection.name,
      image: connection.image,
      role: connection.role,
      clientId: connection.clientId,
    })),
  );
}

function aggregatePresence(
  connections: PresenceDetails[],
): RealtimePresenceMember[] {
  const byUser = new Map<string, RealtimePresenceMember>();
  for (const connection of connections) {
    const current = byUser.get(connection.userId);
    if (current) {
      current.connectionCount += 1;
      continue;
    }
    byUser.set(connection.userId, {
      userId: connection.userId,
      name: connection.name,
      image: connection.image,
      role: connection.role,
      connectionCount: 1,
    });
  }
  return [...byUser.values()].sort((a, b) => a.name.localeCompare(b.name));
}

function presenceDetails(connection: ConnectionRecord): PresenceDetails {
  return {
    clientId: connection.clientId,
    userId: connection.userId,
    name: connection.name,
    image: connection.image,
    role: connection.role,
  };
}

async function storePresence(connection: ConnectionRecord): Promise<void> {
  const redis = getRealtimeRedis();
  if (!redis) return;
  const now = Date.now();
  try {
    await redis
      .multi()
      .zadd(
        realtimePresenceSetKey(connection.boardId),
        now,
        connection.presenceId,
      )
      .hset(
        realtimePresenceHashKey(connection.boardId),
        connection.presenceId,
        JSON.stringify(presenceDetails(connection)),
      )
      .exec();
  } catch (error) {
    console.error("realtime presence write failed", {
      boardId: connection.boardId,
      error,
    });
  }
}

async function removePresence(connection: ConnectionRecord): Promise<void> {
  const redis = getRealtimeRedis();
  if (!redis) return;
  try {
    await redis
      .multi()
      .zrem(realtimePresenceSetKey(connection.boardId), connection.presenceId)
      .hdel(realtimePresenceHashKey(connection.boardId), connection.presenceId)
      .exec();
  } catch (error) {
    console.error("realtime presence removal failed", {
      boardId: connection.boardId,
      error,
    });
  }
}

async function presenceMembers(
  boardId: string,
): Promise<RealtimePresenceMember[]> {
  const redis = getRealtimeRedis();
  if (!redis) return localPresenceMembers(boardId);
  try {
    const activeKey = realtimePresenceSetKey(boardId);
    const detailsKey = realtimePresenceHashKey(boardId);
    await redis.zremrangebyscore(
      activeKey,
      "-inf",
      Date.now() - PRESENCE_STALE_MS,
    );
    const [activeIds, details] = await Promise.all([
      redis.zrange(activeKey, "0", "-1"),
      redis.hgetall(detailsKey),
    ]);
    const active = new Set(activeIds);
    const stale = Object.keys(details).filter((id) => !active.has(id));
    if (stale.length > 0) void redis.hdel(detailsKey, ...stale);

    const parsed: PresenceDetails[] = [];
    for (const id of activeIds) {
      const raw = details[id];
      if (!raw) continue;
      try {
        parsed.push(JSON.parse(raw) as PresenceDetails);
      } catch {
        // An invalid entry expires naturally and must not break the room.
      }
    }
    return aggregatePresence(parsed);
  } catch (error) {
    console.error("realtime presence read failed", { boardId, error });
    return localPresenceMembers(boardId);
  }
}

async function broadcastPresence(boardId: string): Promise<void> {
  const members = await presenceMembers(boardId);
  for (const connection of boardConnections(boardId)) {
    safeSend(connection.ws, { type: "presence.updated", boardId, members });
  }
}

async function notifyPresence(boardId: string): Promise<void> {
  await broadcastPresence(boardId);
  await publishRealtimeBusEvent({
    type: "presence.changed",
    boardId,
    eventId: crypto.randomUUID(),
    originInstanceId: hub.instanceId,
  });
}

function broadcastBoardEvent(event: RealtimeBusEvent): void {
  if (event.type === "presence.changed") return;
  for (const connection of boardConnections(event.boardId)) {
    if (
      (event.type === "cursor.moved" || event.type === "nodes.dragged") &&
      connection.clientId === event.sourceId
    ) {
      continue;
    }
    safeSend(connection.ws, event);
  }
}

async function applyAccessEvent(event: RealtimeAccessEvent): Promise<void> {
  for (const connection of boardConnections(event.boardId)) {
    if (connection.userId !== event.userId) continue;
    safeSend(connection.ws, event);
    if (event.role === null) {
      connection.ws.close(1008, "Board access removed");
      continue;
    }
    connection.role = event.role;
    await storePresence(connection);
  }
  await broadcastPresence(event.boardId);
}

function parseBusEvent(raw: string): RealtimeBusEvent | null {
  try {
    const value = JSON.parse(raw) as Partial<RealtimeBusEvent>;
    if (
      typeof value !== "object" ||
      value === null ||
      typeof value.type !== "string" ||
      typeof value.boardId !== "string" ||
      typeof value.eventId !== "string"
    ) {
      return null;
    }
    return value as RealtimeBusEvent;
  } catch {
    return null;
  }
}

async function deliverBusEvent(raw: string): Promise<void> {
  const event = parseBusEvent(raw);
  if (!event || event.originInstanceId === hub.instanceId) return;
  if (event.type === "presence.changed") {
    await broadcastPresence(event.boardId);
    return;
  }
  if (event.type === "access.changed") {
    await applyAccessEvent(event);
    return;
  }
  broadcastBoardEvent(event);
}

async function startSubscriber(): Promise<void> {
  if (hub.subscriber || hub.subscriberStart)
    return hub.subscriberStart ?? undefined;
  const subscriber = createRealtimeSubscriber();
  if (!subscriber) return;
  hub.subscriber = subscriber;
  hub.subscriberStart = (async () => {
    subscriber.on("pmessage", (_pattern, _channel, raw) => {
      void deliverBusEvent(raw);
    });
    subscriber.on("error", (error) => {
      console.error("realtime subscriber error", error);
    });
    await subscriber.psubscribe(realtimeBoardChannelPattern());
  })()
    .catch((error) => {
      console.error("realtime subscriber start failed", error);
      hub.subscriber = null;
      void subscriber.quit().catch(() => {});
    })
    .finally(() => {
      hub.subscriberStart = null;
    });
  await hub.subscriberStart;
}

async function heartbeat(): Promise<void> {
  const now = Date.now();
  const boards = new Set<string>();
  const active: ConnectionRecord[] = [];
  for (const connection of hub.connections.values()) {
    if (connection.closed) continue;
    if (now - connection.lastSeenAt > CONNECTION_STALE_MS) {
      connection.ws.close(1001, "Heartbeat timeout");
      continue;
    }
    boards.add(connection.boardId);
    active.push(connection);
  }
  await Promise.all(active.map(storePresence));
  await Promise.all([...boards].map(broadcastPresence));
}

function startHeartbeat(): void {
  if (hub.heartbeat) return;
  hub.heartbeat = setInterval(() => void heartbeat(), HEARTBEAT_MS);
}

async function stopInfrastructureIfIdle(): Promise<void> {
  if (hub.connections.size > 0) return;
  if (hub.heartbeat) {
    clearInterval(hub.heartbeat);
    hub.heartbeat = null;
  }
  const subscriber = hub.subscriber;
  hub.subscriber = null;
  if (subscriber) await subscriber.quit().catch(() => {});
}

async function closeConnection(connection: ConnectionRecord): Promise<void> {
  if (connection.closed) return;
  connection.closed = true;
  hub.connections.delete(connection.ws);
  await removePresence(connection);
  await notifyPresence(connection.boardId);
  await stopInfrastructureIfIdle();
}

async function emitEphemeralEvent(
  connection: ConnectionRecord,
  event: RealtimeClientEvent,
): Promise<void> {
  if (event.type === "ping") {
    safeSend(connection.ws, { type: "pong" });
    return;
  }
  if (event.type === "nodes.dragged" && connection.role === "viewer") return;
  const now = Date.now();
  if (event.type === "cursor.moved") {
    if (event.position && now - connection.lastCursorAt < 25) return;
    connection.lastCursorAt = now;
  } else {
    if (now - connection.lastDragAt < 25) return;
    connection.lastDragAt = now;
  }

  const busEvent: RealtimeBusEvent =
    event.type === "cursor.moved"
      ? {
          type: event.type,
          boardId: connection.boardId,
          eventId: crypto.randomUUID(),
          originInstanceId: hub.instanceId,
          sourceId: connection.clientId,
          userId: connection.userId,
          name: connection.name,
          position: event.position,
        }
      : {
          type: event.type,
          boardId: connection.boardId,
          eventId: crypto.randomUUID(),
          originInstanceId: hub.instanceId,
          sourceId: connection.clientId,
          userId: connection.userId,
          nodes: event.nodes,
        };
  broadcastBoardEvent(busEvent);
  await publishRealtimeBusEvent(busEvent);
}

function handleMessage(connection: ConnectionRecord, raw: RawData): void {
  connection.lastSeenAt = Date.now();
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw.toString());
  } catch {
    return;
  }
  const result = realtimeClientEventSchema.safeParse(parsed);
  if (!result.success) return;
  void emitEphemeralEvent(connection, result.data);
}

async function initializeConnection(
  connection: ConnectionRecord,
): Promise<void> {
  await Promise.all([startSubscriber(), storePresence(connection)]);
  const [members, version] = await Promise.all([
    presenceMembers(connection.boardId),
    getBoardRealtimeVersion(connection.boardId),
  ]);
  safeSend(connection.ws, {
    type: "ready",
    boardId: connection.boardId,
    role: connection.role,
    version,
    members,
  });
  await notifyPresence(connection.boardId);
}

export function registerRealtimeConnection(
  ws: WebSocket,
  identity: ConnectionIdentity,
): void {
  const connection: ConnectionRecord = {
    ...identity,
    ws,
    presenceId: `${hub.instanceId}:${crypto.randomUUID()}`,
    lastSeenAt: Date.now(),
    lastCursorAt: 0,
    lastDragAt: 0,
    closed: false,
  };
  hub.connections.set(ws, connection);
  ws.on("message", (raw) => handleMessage(connection, raw));
  ws.on("close", () => void closeConnection(connection));
  ws.on("error", (error) => {
    console.error("realtime socket error", {
      boardId: connection.boardId,
      userId: connection.userId,
      error,
    });
  });
  startHeartbeat();
  void initializeConnection(connection);
}
