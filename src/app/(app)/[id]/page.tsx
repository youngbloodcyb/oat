import { Suspense } from "react";
import { Board, BoardLoading, BoardNotFound } from "@/components/board";
import { getBoardChat } from "@/services/board-chats";
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
  // Fetch the chat alongside the board; it rejects when the board isn't
  // accessible, which only matters once we know the board exists.
  const chatPromise = getBoardChat(id);
  chatPromise.catch(() => {});
  const board = await getBoard(id);

  if (!board) return <BoardNotFound />;
  return (
    <Board
      board={board}
      chat={await chatPromise}
      focusNodeId={typeof node === "string" ? node : undefined}
    />
  );
}
