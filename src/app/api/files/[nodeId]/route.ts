import { get } from "@vercel/blob";
import type { NodeData } from "@/db/schema";
import { getSession } from "@/lib/auth-server";
import { requireNodeAccess } from "@/services/board-access";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ nodeId: string }> },
) {
  const { nodeId } = await params;
  const session = await getSession();
  if (!session?.user) return new Response("Unauthorized", { status: 401 });

  const nodeAccess = await requireNodeAccess(
    nodeId,
    session.user.id,
    "view",
  ).catch(() => null);
  if (!nodeAccess) return new Response("Not found", { status: 404 });
  const { node } = nodeAccess;

  const data = node.data as NodeData;
  let objectKey: string | undefined;
  let externalUrl: string | undefined;
  if (data.kind === "image" || data.kind === "pdf") {
    objectKey = data.objectKey;
    externalUrl = data.url;
  }
  if (!objectKey) {
    if (externalUrl) return Response.redirect(externalUrl, 302);
    return new Response("Not found", { status: 404 });
  }

  const ifNoneMatch = req.headers.get("if-none-match") ?? undefined;
  const result = await get(objectKey, {
    access: "private",
    ifNoneMatch,
  });
  if (!result) return new Response("Not found", { status: 404 });
  if (result.statusCode === 304) {
    return new Response(null, {
      status: 304,
      headers: {
        "Cache-Control": "private, no-cache",
        ETag: result.blob.etag,
      },
    });
  }

  const headers = new Headers({
    "Content-Type": result.blob.contentType,
    "Content-Length": String(result.blob.size),
    "Cache-Control": "private, no-cache",
    "Content-Disposition": `inline; filename="${nodeId}"`,
    "X-Content-Type-Options": "nosniff",
  });
  // Uploaded SVGs can carry script; sandbox them when opened directly. PDFs are
  // exempt because a sandbox CSP breaks the browser's built-in PDF viewer.
  if (result.blob.contentType !== "application/pdf") {
    headers.set(
      "Content-Security-Policy",
      "default-src 'none'; style-src 'unsafe-inline'; sandbox",
    );
  }
  if (result.blob.etag) headers.set("ETag", result.blob.etag);

  return new Response(result.stream as unknown as ReadableStream, { headers });
}
