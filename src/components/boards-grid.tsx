import Link from "next/link";
import { BoardCardMenu } from "@/components/board-card-menu";
import { BoardPreview } from "@/components/board-preview";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { listBoardPreviews, listBoards } from "@/services/boards";

const gridClassName = "grid grid-cols-2 gap-4 sm:grid-cols-3";
const cardClassName =
  "flex aspect-[4/3] flex-col overflow-hidden rounded-lg border bg-card p-4";

// Bleeds through the card's p-4 to fill the area above the separator.
const previewClassName = "-mx-4 -mt-4 min-h-0 flex-1 p-3";

// A fixed locale keeps server and client renders identical.
const dateFormat = new Intl.DateTimeFormat("en-US", { dateStyle: "long" });

// Bleeds through the card's p-4 so the line touches both edges.
const separatorClassName = "-mx-4 data-horizontal:w-[calc(100%+2rem)]";

export async function BoardsGrid() {
  const [boards, previews] = await Promise.all([
    listBoards(),
    listBoardPreviews(),
  ]);

  if (boards.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-12 text-center text-sm text-muted-foreground">
        No boards yet. Create your first one.
      </div>
    );
  }

  return (
    <ul className={gridClassName}>
      {boards.map((b) => (
        <li key={b.id} className="relative">
          <Link
            href={`/${b.id}`}
            className={`${cardClassName} transition-colors hover:bg-muted`}
          >
            <div className={previewClassName}>
              <BoardPreview nodes={previews.get(b.id) ?? []} />
            </div>
            <Separator className={`${separatorClassName} mb-3`} />
            <div className="truncate text-sm font-medium">{b.name}</div>
            {/* Right padding leaves room for the options button. */}
            <div className="flex items-center gap-2 pr-8 text-xs text-muted-foreground">
              <span>{dateFormat.format(new Date(b.createdAt))}</span>
              {b.accessRole !== "owner" && (
                <span className="rounded-full bg-muted px-2 py-0.5 capitalize">
                  {b.accessRole}
                </span>
              )}
            </div>
          </Link>
          {/* Outside the link: buttons can't be nested inside an anchor. */}
          <div className="absolute right-2 bottom-2">
            <BoardCardMenu
              boardId={b.id}
              boardName={b.name}
              canDelete={b.accessRole === "owner"}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

export function BoardsGridSkeleton() {
  return (
    <ul className={gridClassName} aria-busy="true" aria-label="Loading boards">
      {Array.from({ length: 6 }, (_, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: static placeholder list
        <li key={i}>
          <div className={`${cardClassName} gap-2`}>
            <div className={previewClassName} />
            <Separator className={`${separatorClassName} mb-1`} />
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-3 w-1/3" />
          </div>
        </li>
      ))}
    </ul>
  );
}
