import "server-only";

import Redis from "ioredis";
import type {
  RealtimeAccessEventInput,
  RealtimeBusEvent,
  RealtimeDurableEvent,
  RealtimeDurableEventInput,
} from "@/lib/realtime-protocol";

const globalForRealtimeRedis = globalThis as typeof globalThis & {
  oatRealtimeRedis?: Redis | null;
};

function redisUrl(): string | undefined {
  return process.env.REDIS_URL ?? process.env.KV_URL;
}

function createRedis(): Redis | null {
  const url = redisUrl();
  if (!url) return null;
  return new Redis(url, {
    lazyConnect: true,
    maxRetriesPerRequest: 2,
    retryStrategy: (attempt) => Math.min(attempt * 200, 2_000),
  });
}

export function getRealtimeRedis(): Redis | null {
  if (globalForRealtimeRedis.oatRealtimeRedis === undefined) {
    globalForRealtimeRedis.oatRealtimeRedis = createRedis();
  }
  return globalForRealtimeRedis.oatRealtimeRedis;
}

export function createRealtimeSubscriber(): Redis | null {
  const url = redisUrl();
  if (!url) return null;
  return new Redis(url, {
    lazyConnect: true,
    maxRetriesPerRequest: null,
    retryStrategy: (attempt) => Math.min(attempt * 200, 5_000),
  });
}

function environmentNamespace(): string {
  if (process.env.VERCEL_ENV === "production") return "production";
  if (process.env.VERCEL_ENV === "preview") {
    return `preview:${process.env.VERCEL_URL ?? "unknown"}`;
  }
  return "development";
}

const prefix = `oat:${environmentNamespace()}:realtime`;

export const realtimeBoardChannel = (boardId: string) =>
  `${prefix}:board:${boardId}`;
export const realtimeBoardChannelPattern = () => `${prefix}:board:*`;
export const realtimeBoardVersionKey = (boardId: string) =>
  `${prefix}:version:${boardId}`;
export const realtimePresenceSetKey = (boardId: string) =>
  `${prefix}:presence:${boardId}:active`;
export const realtimePresenceHashKey = (boardId: string) =>
  `${prefix}:presence:${boardId}:details`;

export async function publishRealtimeBusEvent(
  event: RealtimeBusEvent,
): Promise<boolean> {
  const redis = getRealtimeRedis();
  if (!redis) return false;
  try {
    await redis.publish(
      realtimeBoardChannel(event.boardId),
      JSON.stringify(event),
    );
    return true;
  } catch (error) {
    console.error("realtime publish failed", {
      boardId: event.boardId,
      type: event.type,
      error,
    });
    return false;
  }
}

export async function publishDurableBoardEvent(
  input: RealtimeDurableEventInput,
): Promise<void> {
  const redis = getRealtimeRedis();
  if (!redis) return;
  try {
    const version = await redis.incr(realtimeBoardVersionKey(input.boardId));
    const event: RealtimeDurableEvent = {
      ...input,
      eventId: crypto.randomUUID(),
      version,
    } as RealtimeDurableEvent;
    await redis.publish(
      realtimeBoardChannel(input.boardId),
      JSON.stringify(event),
    );
  } catch (error) {
    // PostgreSQL is authoritative. A missed notification is repaired by the
    // client's reconnect snapshot, so realtime failures must not undo writes.
    console.error("realtime durable publish failed", {
      boardId: input.boardId,
      type: input.type,
      error,
    });
  }
}

export async function publishAccessEvent(
  input: RealtimeAccessEventInput,
): Promise<void> {
  await publishRealtimeBusEvent({
    ...input,
    eventId: crypto.randomUUID(),
  });
}

export async function getBoardRealtimeVersion(
  boardId: string,
): Promise<number> {
  const redis = getRealtimeRedis();
  if (!redis) return 0;
  try {
    const value = await redis.get(realtimeBoardVersionKey(boardId));
    return value == null ? 0 : Number(value);
  } catch (error) {
    console.error("realtime version read failed", { boardId, error });
    return 0;
  }
}
