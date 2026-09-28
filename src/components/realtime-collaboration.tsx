"use client";

import { useReactFlow, useViewport } from "@xyflow/react";
import type { RemoteCursor } from "@/hooks/use-board-realtime";
import type { RealtimePresenceMember } from "@/lib/realtime-protocol";

function initials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

function colorFor(value: string): string {
  let hash = 0;
  for (const character of value) {
    hash = (hash * 31 + character.charCodeAt(0)) | 0;
  }
  return `hsl(${Math.abs(hash) % 360} 70% 48%)`;
}

export function RealtimePresence({
  members,
  status,
}: {
  members: RealtimePresenceMember[];
  status: "connecting" | "online" | "offline";
}) {
  return (
    <div className="fixed top-4 right-4 z-50 flex items-center gap-2 rounded-full border bg-card/95 px-2 py-1 shadow-sm backdrop-blur">
      <output
        className={`size-2 rounded-full ${
          status === "online"
            ? "bg-emerald-500"
            : status === "connecting"
              ? "bg-amber-500"
              : "bg-muted-foreground"
        }`}
        aria-label={`Realtime ${status}`}
      />
      <div className="flex -space-x-1.5">
        {members.slice(0, 5).map((member) => (
          <div
            key={member.userId}
            className="flex size-7 items-center justify-center overflow-hidden rounded-full border-2 border-card text-[10px] font-semibold text-white"
            style={{ backgroundColor: colorFor(member.userId) }}
            title={`${member.name} (${member.role})`}
          >
            {member.image ? (
              // biome-ignore lint/performance/noImgElement: auth avatars may be remote URLs.
              <img
                src={member.image}
                alt={member.name}
                className="size-full object-cover"
              />
            ) : (
              initials(member.name)
            )}
          </div>
        ))}
      </div>
      {members.length > 5 && (
        <span className="pr-1 text-xs text-muted-foreground">
          +{members.length - 5}
        </span>
      )}
    </div>
  );
}

export function RealtimeCursors({ cursors }: { cursors: RemoteCursor[] }) {
  const { flowToScreenPosition } = useReactFlow();
  // Subscribe so cursor overlays move when this viewer pans or zooms.
  useViewport();

  return (
    <div className="pointer-events-none fixed inset-0 z-40 overflow-hidden">
      {cursors.map((cursor) => {
        const point = flowToScreenPosition(cursor.position);
        const color = colorFor(cursor.userId);
        return (
          <div
            key={cursor.clientId}
            className="absolute top-0 left-0 transition-transform duration-75"
            style={{ transform: `translate(${point.x}px, ${point.y}px)` }}
          >
            <svg
              aria-hidden="true"
              width="18"
              height="24"
              viewBox="0 0 18 24"
              fill="none"
            >
              <path
                d="M1 1L16 11L9.2 12.3L5.5 19L1 1Z"
                fill={color}
                stroke="white"
                strokeWidth="1.5"
                strokeLinejoin="round"
              />
            </svg>
            <span
              className="ml-3 inline-block -translate-y-1 rounded px-1.5 py-0.5 text-[10px] font-medium whitespace-nowrap text-white shadow-sm"
              style={{ backgroundColor: color }}
            >
              {cursor.name}
            </span>
          </div>
        );
      })}
    </div>
  );
}
