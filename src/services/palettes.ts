"use server";

import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { palettes } from "@/db/schema";
import { requireUser } from "@/lib/auth-server";
import type { Palette } from "@/lib/palette";
import { requireBoardAccess } from "@/services/board-access";

const boardIdSchema = z.string().min(1).max(200);

export type ImagePalette = Palette & { nodeId: string };

/** The extracted palette of every image on a board that has one yet. */
export async function listBoardPalettes(
  boardIdInput: string,
): Promise<ImagePalette[]> {
  const currentUser = await requireUser();
  const boardId = boardIdSchema.parse(boardIdInput);
  await requireBoardAccess(boardId, currentUser.id, "view");

  return db
    .select({
      nodeId: palettes.nodeId,
      scoredBy: palettes.scoredBy,
      colors: palettes.colors,
    })
    .from(palettes)
    .where(eq(palettes.boardId, boardId));
}
