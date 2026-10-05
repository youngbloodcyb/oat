import { Suspense } from "react";
import { Board, BoardLoading, BoardNotFound } from "@/components/board";
import { getBoardChat } from "@/services/board-chats";
import { getBoard } from "@/services/boards";
import { listBoardShares } from "@/services/shares";

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
  // Fetch the chat and share list alongside the board. Both reject when the
  // caller lacks access (shares are owner-only), which only matters once we
  // know the board exists and what role the caller has.
  const chatPromise = getBoardChat(id);
  const sharesPromise = listBoardShares(id);
  chatPromise.catch(() => {});
  sharesPromise.catch(() => {});
  const board = await getBoard(id);

  if (!board) return <BoardNotFound />;
  const [chat, shares] = await Promise.all([
    chatPromise,
    board.accessRole === "owner" ? sharesPromise : [],
  ]);
  return (
    <Board
      board={board}
      chat={chat}
      shares={shares}
      focusNodeId={typeof node === "string" ? node : undefined}
    />
  );
}
