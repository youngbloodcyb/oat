import { Suspense } from "react";
import { BoardsGrid, BoardsGridSkeleton } from "@/components/boards-grid";
import { NewBoardButton } from "@/components/new-board-button";

export const instant = true;

export default function BoardsPage() {
  return (
    <main className="mx-auto w-full max-w-5xl p-6">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-semibold">Your boards</h1>
        <NewBoardButton />
      </div>
      <Suspense fallback={<BoardsGridSkeleton />}>
        <BoardsGrid />
      </Suspense>
    </main>
  );
}
