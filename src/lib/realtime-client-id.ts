"use client";

const STORAGE_KEY = "oat:realtime-client-id";
let memoryId: string | null = null;

export function getRealtimeClientId(): string {
  if (memoryId) return memoryId;
  const stored = window.sessionStorage.getItem(STORAGE_KEY);
  if (stored) {
    memoryId = stored;
    return stored;
  }
  memoryId = crypto.randomUUID();
  window.sessionStorage.setItem(STORAGE_KEY, memoryId);
  return memoryId;
}
