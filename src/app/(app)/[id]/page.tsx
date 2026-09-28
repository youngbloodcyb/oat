import { Suspense } from "react";
import { Board, BoardLoading, BoardNotFound } from "@/components/board";
import { getBoard } from "@/services/boards";

export const instant = true;

type Params = Promise<{ id: string }>;
type SearchParams = Promise<{ node?: string | string[] }>;

export default function BoardPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  return (
    <Suspense fallback={<BoardLoading />}>
      <BoardLoader params={params} searchParams={searchParams} />
    </Suspense>
  );
}

// Access checks stay uncached so revoked shares take effect immediately.
async function BoardLoader({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  const [{ id }, { node }] = await Promise.all([params, searchParams]);
  const board = await getBoard(id);

  if (!board) return <BoardNotFound />;
  return (
    <Board
      board={board}
      focusNodeId={typeof node === "string" ? node : undefined}
    />
  );
}
