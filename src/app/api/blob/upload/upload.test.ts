import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth-server", () => ({
  requireUser: vi.fn(),
}));

vi.mock("@vercel/blob/client", () => ({
  handleUpload: vi.fn(),
}));

vi.mock("@/services/board-access", () => ({
  requireBoardAccess: vi.fn(),
}));

import { handleUpload } from "@vercel/blob/client";
import { requireUser } from "@/lib/auth-server";
import { requireBoardAccess } from "@/services/board-access";
import { POST } from "./route";

const mockRequireUser = vi.mocked(requireUser);
const mockHandleUpload = vi.mocked(handleUpload) as any;
const mockRequireBoardAccess = vi.mocked(requireBoardAccess);

const USER_A = {
  id: "user-a",
  name: "A",
  email: "a@test.com",
  emailVerified: false,
  image: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

function makeReq(body: unknown) {
  return new Request("http://localhost/api/blob/upload", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireUser.mockResolvedValue(USER_A as any);
  mockHandleUpload.mockImplementation(
    async ({
      onBeforeGenerateToken,
    }: {
      onBeforeGenerateToken: (
        pathname: string,
        clientPayload: string,
      ) => Promise<unknown>;
    }) => {
      await onBeforeGenerateToken("board-a/user-a/file.png", "board-a");
      return { ok: true } as any;
    },
  );
});

describe("POST /api/blob/upload", () => {
  it("rejects when not authenticated", async () => {
    mockRequireUser.mockRejectedValue(new Error("Unauthorized"));
    await expect(
      POST(makeReq({ pathname: "board-a/user-a/file.png" })),
    ).rejects.toThrow("Unauthorized");
  });

  it("rejects when the object key is not scoped to the authenticated user", async () => {
    mockHandleUpload.mockImplementation(
      async ({
        onBeforeGenerateToken,
      }: {
        onBeforeGenerateToken: (
          pathname: string,
          clientPayload: string,
        ) => Promise<unknown>;
      }) => {
        await onBeforeGenerateToken("board-a/user-b/file.png", "board-a");
        return { ok: true } as any;
      },
    );
    await expect(
      POST(makeReq({ pathname: "board-a/user-b/file.png" })),
    ).rejects.toThrow("Object key must be scoped to the selected board");
  });

  it("allows when the object key is scoped to the authenticated user", async () => {
    const res = await POST(makeReq({ pathname: "board-a/user-a/file.png" }));
    expect(res.status).toBe(200);
    expect(mockRequireBoardAccess).toHaveBeenCalledWith(
      "board-a",
      USER_A.id,
      "edit",
    );
  });
});
