"use server";

import { and, asc, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { type BoardShareRole, boardShares, user as users } from "@/db/schema";
import { requireUser } from "@/lib/auth-server";
import { publishAccessEvent } from "@/lib/realtime-redis";
import { requireBoardAccess } from "@/services/board-access";

const boardIdSchema = z.string().min(1).max(200);
const roleSchema = z.enum(["viewer", "editor"]);
const emailSchema = z.string().trim().email().max(320);

export type BoardShareMember = {
  userId: string;
  name: string;
  email: string;
  image: string | null;
  role: BoardShareRole;
};

function refreshBoardPaths(boardId: string) {
  revalidatePath("/");
  revalidatePath(`/${boardId}`);
}

export async function listBoardShares(
  boardIdInput: string,
): Promise<BoardShareMember[]> {
  const currentUser = await requireUser();
  const boardId = boardIdSchema.parse(boardIdInput);
  await requireBoardAccess(boardId, currentUser.id, "owner");

  return db
    .select({
      userId: users.id,
      name: users.name,
      email: users.email,
      image: users.image,
      role: boardShares.role,
    })
    .from(boardShares)
    .innerJoin(users, eq(users.id, boardShares.userId))
    .where(eq(boardShares.boardId, boardId))
    .orderBy(asc(users.name), asc(users.email));
}

export async function addBoardShare(input: {
  boardId: string;
  email: string;
  role: BoardShareRole;
}): Promise<void> {
  const currentUser = await requireUser();
  const parsed = z
    .object({ boardId: boardIdSchema, email: emailSchema, role: roleSchema })
    .parse(input);
  const { board } = await requireBoardAccess(
    parsed.boardId,
    currentUser.id,
    "owner",
  );

  const rows = await db
    .select({ id: users.id })
    .from(users)
    .where(sql`lower(${users.email}) = ${parsed.email.toLowerCase()}`)
    .limit(1);
  const target = rows[0];
  if (!target) throw new Error("No account found for that email");
  if (target.id === board.userId)
    throw new Error("The owner already has access");

  await db
    .insert(boardShares)
    .values({
      boardId: parsed.boardId,
      userId: target.id,
      role: parsed.role,
    })
    .onConflictDoUpdate({
      target: [boardShares.boardId, boardShares.userId],
      set: { role: parsed.role, updatedAt: new Date() },
    });
  await publishAccessEvent({
    type: "access.changed",
    boardId: parsed.boardId,
    userId: target.id,
    role: parsed.role,
  });
  refreshBoardPaths(parsed.boardId);
}

export async function updateBoardShare(input: {
  boardId: string;
  userId: string;
  role: BoardShareRole;
}): Promise<void> {
  const currentUser = await requireUser();
  const parsed = z
    .object({
      boardId: boardIdSchema,
      userId: z.string().min(1).max(200),
      role: roleSchema,
    })
    .parse(input);
  await requireBoardAccess(parsed.boardId, currentUser.id, "owner");

  const result = await db
    .update(boardShares)
    .set({ role: parsed.role, updatedAt: new Date() })
    .where(
      and(
        eq(boardShares.boardId, parsed.boardId),
        eq(boardShares.userId, parsed.userId),
      ),
    );
  if (result.rowCount === 0) throw new Error("Shared member not found");
  await publishAccessEvent({
    type: "access.changed",
    boardId: parsed.boardId,
    userId: parsed.userId,
    role: parsed.role,
  });
  refreshBoardPaths(parsed.boardId);
}

export async function removeBoardShare(input: {
  boardId: string;
  userId: string;
}): Promise<void> {
  const currentUser = await requireUser();
  const parsed = z
    .object({
      boardId: boardIdSchema,
      userId: z.string().min(1).max(200),
    })
    .parse(input);
  await requireBoardAccess(parsed.boardId, currentUser.id, "owner");

  const result = await db
    .delete(boardShares)
    .where(
      and(
        eq(boardShares.boardId, parsed.boardId),
        eq(boardShares.userId, parsed.userId),
      ),
    );
  if (result.rowCount === 0) throw new Error("Shared member not found");
  await publishAccessEvent({
    type: "access.changed",
    boardId: parsed.boardId,
    userId: parsed.userId,
    role: null,
  });
  refreshBoardPaths(parsed.boardId);
}
