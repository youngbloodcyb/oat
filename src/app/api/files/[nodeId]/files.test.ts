import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth-server", () => ({
  getSession: vi.fn(),
}));

vi.mock("@/services/board-access", () => ({
  requireNodeAccess: vi.fn(),
}));

vi.mock("@vercel/blob", () => ({
  get: vi.fn(),
}));

import { get } from "@vercel/blob";
import { getSession } from "@/lib/auth-server";
import { requireNodeAccess } from "@/services/board-access";
import { GET } from "./route";

const mockGetSession = vi.mocked(getSession);
const mockGet = vi.mocked(get);
const mockRequireNodeAccess = vi.mocked(requireNodeAccess);

const SESSION_A = {
  user: {
    id: "user-a",
    name: "A",
    email: "a@test.com",
    emailVerified: false,
    image: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  session: {
    id: "sess-a",
    userId: "user-a",
    expiresAt: new Date(),
    token: "tok-a",
    createdAt: new Date(),
    updatedAt: new Date(),
    ipAddress: null,
    userAgent: null,
  },
};

function makeReq(nodeId: string) {
  return [
    new Request(`http://localhost/api/files/${nodeId}`),
    { params: Promise.resolve({ nodeId }) },
  ] as const;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetSession.mockResolvedValue(SESSION_A as any);
});

function allowNode(node: { id: string; data: unknown }) {
  mockRequireNodeAccess.mockResolvedValue({ node, access: {} } as any);
}

describe("GET /api/files/[nodeId]", () => {
  it("returns 401 when not authenticated", async () => {
    mockGetSession.mockResolvedValue(null as any);
    const [req, ctx] = makeReq("n1");
    const res = await GET(req, ctx);
    expect(res.status).toBe(401);
  });

  it("returns 404 when the node does not exist", async () => {
    mockRequireNodeAccess.mockRejectedValue(new Error("Node not found"));
    const [req, ctx] = makeReq("missing");
    const res = await GET(req, ctx);
    expect(res.status).toBe(404);
  });

  it("returns 404 when the node is owned by another user", async () => {
    mockRequireNodeAccess.mockRejectedValue(new Error("Board not found"));
    const [req, ctx] = makeReq("n1");
    const res = await GET(req, ctx);
    expect(res.status).toBe(404);
    expect(mockGet).not.toHaveBeenCalled();
  });

  it("redirects to the external url when there is no objectKey", async () => {
    allowNode({
      id: "n1",
      data: { kind: "image", url: "https://example.com/img.png" },
    });
    const [req, ctx] = makeReq("n1");
    const res = await GET(req, ctx);
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("https://example.com/img.png");
  });

  it("returns 404 when there is no objectKey and no external url", async () => {
    allowNode({ id: "n1", data: { kind: "text", text: "hi" } });
    const [req, ctx] = makeReq("n1");
    const res = await GET(req, ctx);
    expect(res.status).toBe(404);
  });

  it("streams the blob for an owned image node with an objectKey", async () => {
    allowNode({
      id: "n1",
      data: { kind: "image", objectKey: "user-a/board-a/img1" },
    });
    mockGet.mockResolvedValue({
      statusCode: 200,
      blob: {
        contentType: "image/png",
        size: 1024,
        etag: "abc123",
      },
      stream: new ReadableStream({
        start(c) {
          c.close();
        },
      }),
    } as any);
    const [req, ctx] = makeReq("n1");
    const res = await GET(req, ctx);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/png");
    expect(res.headers.get("etag")).toBe("abc123");
    expect(res.headers.get("cache-control")).toBe("private, no-cache");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
  });

  it("sandboxes SVGs so embedded script cannot run on the app origin", async () => {
    allowNode({
      id: "n1",
      data: { kind: "image", objectKey: "user-a/board-a/logo" },
    });
    mockGet.mockResolvedValue({
      statusCode: 200,
      blob: { contentType: "image/svg+xml", size: 10, etag: "e" },
      stream: new ReadableStream({ start: (c) => c.close() }),
    } as any);
    const [req, ctx] = makeReq("n1");
    const res = await GET(req, ctx);
    const csp = res.headers.get("content-security-policy");
    expect(csp).toContain("default-src 'none'");
    expect(csp).toContain("sandbox");
  });

  it("does not sandbox PDFs, which would break the embedded viewer", async () => {
    allowNode({
      id: "n1",
      data: { kind: "pdf", objectKey: "user-a/board-a/doc", name: "d.pdf" },
    });
    mockGet.mockResolvedValue({
      statusCode: 200,
      blob: { contentType: "application/pdf", size: 10, etag: "e" },
      stream: new ReadableStream({ start: (c) => c.close() }),
    } as any);
    const [req, ctx] = makeReq("n1");
    const res = await GET(req, ctx);
    expect(res.headers.get("content-security-policy")).toBeNull();
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
  });

  it("requires cached files to be revalidated", async () => {
    allowNode({
      id: "n1",
      data: { kind: "image", objectKey: "user-a/board-a/img1" },
    });
    mockGet.mockResolvedValue({
      statusCode: 304,
      blob: { etag: "abc123" },
    } as never);
    const [request, context] = makeReq("n1");

    const response = await GET(request, context);

    expect(response.status).toBe(304);
    expect(response.headers.get("etag")).toBe("abc123");
    expect(response.headers.get("cache-control")).toBe("private, no-cache");
  });
});
