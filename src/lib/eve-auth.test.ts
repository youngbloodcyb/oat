import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getSession: vi.fn() }));

vi.mock("better-auth", () => ({
  betterAuth: () => ({ api: { getSession: mocks.getSession } }),
}));
vi.mock("@/lib/auth-options", () => ({ authOptions: {} }));

import { oatSessionAuth } from "./eve-auth";

const request = new Request("https://oat.test/eve/v1/session", {
  headers: { cookie: "better-auth.session_token=abc" },
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe("oatSessionAuth", () => {
  it("maps a Better Auth session to an eve user principal", async () => {
    mocks.getSession.mockResolvedValue({
      user: { id: "user-a", email: "a@example.com", name: "A" },
    });

    await expect(oatSessionAuth(request)).resolves.toEqual({
      attributes: { email: "a@example.com", name: "A" },
      authenticator: "better-auth",
      issuer: "oat",
      principalId: "user-a",
      principalType: "user",
      subject: "a@example.com",
    });
    expect(mocks.getSession).toHaveBeenCalledWith({
      headers: request.headers,
    });
  });

  it("skips requests without a session so other authenticators can run", async () => {
    mocks.getSession.mockResolvedValue(null);
    await expect(oatSessionAuth(request)).resolves.toBeNull();
  });
});
