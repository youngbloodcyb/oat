import { Board } from "@/components/board";
import type { Id } from "~/_generated/dataModel";

export default async function BoardPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <Board boardId={id as Id<"boards">} />;
}
