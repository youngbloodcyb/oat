import { Suspense } from "react";
import { AppTopbar } from "@/components/app-topbar";
import { BoardsGrid, BoardsGridSkeleton } from "@/components/boards-grid";
import { NewBoardButton } from "@/components/new-board-button";
import { SignOutButton } from "@/components/sign-out-button";

export const instant = true;

export default function BoardsPage() {
  return (
    <div className="relative min-h-svh w-full">
      <AppTopbar
        left={<h1 className="text-sm font-medium">oat.club</h1>}
        right={
          <>
            <NewBoardButton />
            <SignOutButton />
          </>
        }
      />
      <main className="mx-auto w-full max-w-5xl p-6 pt-14">
        <Suspense fallback={<BoardsGridSkeleton />}>
          <BoardsGrid />
        </Suspense>
      </main>
    </div>
  );
}
