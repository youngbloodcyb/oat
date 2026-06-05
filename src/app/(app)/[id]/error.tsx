"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";

// Safety net for malformed ids (Convex rejects them at the query boundary).
export default function BoardError() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4">
      <p className="text-sm text-muted-foreground">
        This board couldn&rsquo;t be loaded.
      </p>
      <Button asChild variant="outline">
        <Link href="/">Back to boards</Link>
      </Button>
    </div>
  );
}
