import { handleUpload } from "@vercel/blob/client";
import { requireUser } from "@/lib/auth-server";
import { uploadKeyPrefix } from "@/lib/blob";
import { MAX_UPLOAD_SIZE_BYTES } from "@/lib/upload-policy";
import { requireBoardAccess } from "@/services/board-access";

export async function POST(req: Request): Promise<Response> {
  const result = await handleUpload({
    request: req,
    body: await req.json(),
    onBeforeGenerateToken: async (pathname, clientPayload) => {
      const user = await requireUser();
      if (!clientPayload) throw new Error("Board is required");
      await requireBoardAccess(clientPayload, user.id, "edit");
      if (!pathname.startsWith(uploadKeyPrefix(user.id, clientPayload))) {
        throw new Error("Object key must be scoped to the selected board");
      }
      return {
        allowedContentTypes: ["image/*", "application/pdf"],
        maximumSizeInBytes: MAX_UPLOAD_SIZE_BYTES,
        addRandomSuffix: true,
        validUntil: Date.now() + 60 * 60 * 1000,
      };
    },
  });
  return Response.json(result);
}
