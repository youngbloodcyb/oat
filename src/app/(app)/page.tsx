import { Suspense } from "react";
import { BoardsGrid, BoardsGridSkeleton } from "@/components/boards-grid";
import { NewBoardButton } from "@/components/new-board-button";
import { SignOutButton } from "@/components/sign-out-button";

export const instant = true;

export default function BoardsPage() {
  return (
    <main className="mx-auto w-full max-w-5xl p-6">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-semibold">Your boards</h1>
        <div className="flex items-center gap-2">
          <NewBoardButton />
          <SignOutButton />
        </div>
      </div>
      <Suspense fallback={<BoardsGridSkeleton />}>
        <BoardsGrid />
      </Suspense>
    </main>
  );
}
