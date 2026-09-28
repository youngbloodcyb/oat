import { z } from "zod";
import type { ClientNode } from "@/db/schema";
import type { BoardAccessRole } from "@/services/board-access";

export const realtimePositionSchema = z.object({
  x: z.number().finite().min(-10_000_000).max(10_000_000),
  y: z.number().finite().min(-10_000_000).max(10_000_000),
});

export const realtimeClientEventSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("ping") }),
  z.object({
    type: z.literal("cursor.moved"),
    position: realtimePositionSchema.nullable(),
  }),
  z.object({
    type: z.literal("nodes.dragged"),
    nodes: z
      .array(
        z.object({
          id: z.string().min(1).max(200),
          position: realtimePositionSchema,
        }),
      )
      .max(100),
  }),
]);

export type RealtimeClientEvent = z.infer<typeof realtimeClientEventSchema>;

export type RealtimePresenceMember = {
  userId: string;
  name: string;
  image: string | null;
  role: BoardAccessRole;
  connectionCount: number;
};

type RealtimeEventBase = {
  boardId: string;
  eventId: string;
  originInstanceId?: string;
};

export type RealtimeDurableEvent = RealtimeEventBase & {
  version: number;
  sourceId?: string;
  actorUserId: string;
} & (
    | { type: "node.created"; node: ClientNode }
    | { type: "node.updated"; node: ClientNode }
    | { type: "node.deleted"; nodeId: string }
    | { type: "board.updated" }
    | { type: "board.deleted" }
  );

export type RealtimeAccessEvent = RealtimeEventBase & {
  type: "access.changed";
  userId: string;
  role: Exclude<BoardAccessRole, "owner"> | null;
};

export type RealtimeCursorEvent = RealtimeEventBase & {
  type: "cursor.moved";
  sourceId: string;
  userId: string;
  name: string;
  position: { x: number; y: number } | null;
};

export type RealtimeDragEvent = RealtimeEventBase & {
  type: "nodes.dragged";
  sourceId: string;
  userId: string;
  nodes: Array<{ id: string; position: { x: number; y: number } }>;
};

export type RealtimePresenceChangedEvent = RealtimeEventBase & {
  type: "presence.changed";
};

export type RealtimeBusEvent =
  | RealtimeDurableEvent
  | RealtimeAccessEvent
  | RealtimeCursorEvent
  | RealtimeDragEvent
  | RealtimePresenceChangedEvent;

export type RealtimeServerEvent =
  | RealtimeDurableEvent
  | RealtimeAccessEvent
  | RealtimeCursorEvent
  | RealtimeDragEvent
  | {
      type: "ready";
      boardId: string;
      role: BoardAccessRole;
      version: number;
      members: RealtimePresenceMember[];
    }
  | {
      type: "presence.updated";
      boardId: string;
      members: RealtimePresenceMember[];
    }
  | { type: "pong" };

type RealtimeDurableEventInputBase = {
  boardId: string;
  sourceId?: string;
  actorUserId: string;
};

export type RealtimeDurableEventInput = RealtimeDurableEventInputBase &
  (
    | { type: "node.created"; node: ClientNode }
    | { type: "node.updated"; node: ClientNode }
    | { type: "node.deleted"; nodeId: string }
    | { type: "board.updated" }
    | { type: "board.deleted" }
  );

export type RealtimeAccessEventInput = Omit<RealtimeAccessEvent, "eventId">;
