import Link from "next/link";
import { Skeleton } from "@/components/ui/skeleton";
import { listBoards } from "@/services/boards";

const gridClassName = "grid grid-cols-2 gap-4 sm:grid-cols-3";
const cardClassName =
  "flex aspect-[4/3] flex-col justify-end rounded-lg border bg-card p-4";

export async function BoardsGrid() {
  const boards = await listBoards();

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
        <li key={b.id}>
          <Link
            href={`/${b.id}`}
            className={`${cardClassName} transition-colors hover:bg-muted`}
          >
            <div className="truncate text-sm font-medium">{b.name}</div>
            <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
              <span>{new Date(b.createdAt).toLocaleDateString()}</span>
              {b.accessRole !== "owner" && (
                <span className="rounded-full bg-muted px-2 py-0.5 capitalize">
                  {b.accessRole}
                </span>
              )}
            </div>
          </Link>
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
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-3 w-1/3" />
          </div>
        </li>
      ))}
    </ul>
  );
}
