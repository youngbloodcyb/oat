import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  requireBoardAccess: vi.fn(),
  register: vi.fn(),
  upgrade: vi.fn(),
}));

vi.mock("@/lib/auth-server", () => ({
  auth: { api: { getSession: mocks.getSession } },
}));

vi.mock("@/services/board-access", () => ({
  requireBoardAccess: mocks.requireBoardAccess,
}));

vi.mock("@/lib/realtime-server", () => ({
  registerRealtimeConnection: mocks.register,
}));

vi.mock("@vercel/functions", () => ({
  experimental_upgradeWebSocket: mocks.upgrade,
}));

import { GET } from "./route";

const user = {
  id: "user-a",
  name: "Ada",
  image: null,
};

const board = {
  id: "board-a",
  userId: "owner-a",
  name: "Shared board",
  createdAt: new Date("2026-01-01"),
};

function request(
  query = "boardId=board-a&clientId=123e4567-e89b-42d3-a456-426614174000",
) {
  return new Request(`https://oat.test/api/realtime?${query}`);
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getSession.mockResolvedValue({ user });
  mocks.requireBoardAccess.mockResolvedValue({ board, role: "viewer" });
  mocks.upgrade.mockImplementation(async (handler) => {
    handler({ on: vi.fn() });
    return new Response(null, { status: 204 });
  });
});

describe("realtime websocket route", () => {
  it("rejects unauthenticated upgrades", async () => {
    mocks.getSession.mockResolvedValue(null);

    const response = await GET(request());

    expect(response.status).toBe(401);
    expect(mocks.upgrade).not.toHaveBeenCalled();
  });

  it("rejects invalid room parameters", async () => {
    const response = await GET(request("boardId=board-a&clientId=nope"));

    expect(response.status).toBe(400);
    expect(mocks.requireBoardAccess).not.toHaveBeenCalled();
  });

  it("requires view access and registers the authorized identity", async () => {
    const response = await GET(request());

    expect(response.status).toBe(204);
    expect(mocks.requireBoardAccess).toHaveBeenCalledWith(
      "board-a",
      user.id,
      "view",
    );
    expect(mocks.register).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        boardId: "board-a",
        clientId: "123e4567-e89b-42d3-a456-426614174000",
        userId: user.id,
        role: "viewer",
      }),
    );
  });

  it("conceals boards the user cannot access", async () => {
    mocks.requireBoardAccess.mockRejectedValue(new Error("Board not found"));

    const response = await GET(request());

    expect(response.status).toBe(404);
    expect(mocks.upgrade).not.toHaveBeenCalled();
  });
});
