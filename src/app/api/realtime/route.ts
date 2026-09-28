import { experimental_upgradeWebSocket } from "@vercel/functions";
import { z } from "zod";
import { auth } from "@/lib/auth-server";
import { registerRealtimeConnection } from "@/lib/realtime-server";
import { requireBoardAccess } from "@/services/board-access";

export const maxDuration = 300;

const querySchema = z.object({
  boardId: z.string().min(1).max(200),
  clientId: z.string().uuid(),
});

export async function GET(request: Request) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const parsed = querySchema.safeParse({
    boardId: url.searchParams.get("boardId"),
    clientId: url.searchParams.get("clientId"),
  });
  if (!parsed.success) {
    return Response.json({ error: "Invalid realtime room" }, { status: 400 });
  }

  const access = await requireBoardAccess(
    parsed.data.boardId,
    session.user.id,
    "view",
  ).catch(() => null);
  if (!access) {
    return Response.json({ error: "Board not found" }, { status: 404 });
  }

  return experimental_upgradeWebSocket(
    (ws) => {
      registerRealtimeConnection(ws, {
        boardId: parsed.data.boardId,
        clientId: parsed.data.clientId,
        userId: session.user.id,
        name: session.user.name,
        image: session.user.image ?? null,
        role: access.role,
      });
    },
    { maxPayload: 32 * 1024 },
  );
}
