import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => {
  const router = { push: vi.fn(), refresh: vi.fn() };
  return { useRouter: () => router };
});

vi.mock("@/services/nodes", () => ({
  listNodesByBoard: vi.fn().mockResolvedValue([]),
}));

vi.mock("@/lib/realtime-client-id", () => ({
  getRealtimeClientId: () => "00000000-0000-4000-8000-000000000000",
}));

import { useBoardRealtime } from "./use-board-realtime";

class FakeWebSocket {
  static OPEN = 1;
  static instances: FakeWebSocket[] = [];
  readyState = 0;
  closed = false;
  constructor(public url: string) {
    FakeWebSocket.instances.push(this);
  }
  addEventListener() {}
  send() {}
  close() {
    this.closed = true;
  }
}

let visibility: DocumentVisibilityState = "visible";

function setVisibility(state: DocumentVisibilityState) {
  visibility = state;
  document.dispatchEvent(new Event("visibilitychange"));
}

const openSockets = () => FakeWebSocket.instances.filter((s) => !s.closed);

beforeEach(() => {
  vi.useFakeTimers();
  FakeWebSocket.instances = [];
  visibility = "visible";
  vi.stubGlobal("WebSocket", FakeWebSocket);
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    get: () => visibility,
  });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("useBoardRealtime", () => {
  it("does not open a socket when disabled", () => {
    renderHook(() =>
      useBoardRealtime({ boardId: "b1", enabled: false, canEdit: true }),
    );
    expect(FakeWebSocket.instances).toHaveLength(0);
  });

  it("opens a socket when enabled and the tab is visible", () => {
    renderHook(() =>
      useBoardRealtime({ boardId: "b1", enabled: true, canEdit: true }),
    );
    expect(openSockets()).toHaveLength(1);
    expect(openSockets()[0].url).toContain("boardId=b1");
  });

  it("keeps the socket through a brief tab switch", () => {
    renderHook(() =>
      useBoardRealtime({ boardId: "b1", enabled: true, canEdit: true }),
    );
    act(() => setVisibility("hidden"));
    act(() => vi.advanceTimersByTime(10_000));
    act(() => setVisibility("visible"));
    act(() => vi.advanceTimersByTime(60_000));
    expect(FakeWebSocket.instances).toHaveLength(1);
    expect(openSockets()).toHaveLength(1);
  });

  it("closes the socket after the tab stays hidden, then reconnects when visible", () => {
    renderHook(() =>
      useBoardRealtime({ boardId: "b1", enabled: true, canEdit: true }),
    );
    act(() => setVisibility("hidden"));
    act(() => vi.advanceTimersByTime(30_000));
    expect(openSockets()).toHaveLength(0);

    act(() => setVisibility("visible"));
    expect(FakeWebSocket.instances).toHaveLength(2);
    expect(openSockets()).toHaveLength(1);
  });
});
