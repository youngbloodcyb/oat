"use client";

import { DotsThreeIcon, LinkIcon, TrashIcon } from "@phosphor-icons/react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { deleteBoard } from "@/services/boards";

export function BoardCardMenu({
  boardId,
  boardName,
  canDelete,
}: {
  boardId: string;
  boardName: string;
  canDelete: boolean;
}) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, startDelete] = useTransition();

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(
        new URL(`/${boardId}`, window.location.origin).href,
      );
      toast.success("Board link copied");
    } catch {
      toast.error("Couldn't copy the board link");
    }
  };

  const confirmDelete = () => {
    startDelete(async () => {
      try {
        // The action revalidates the boards list, removing this card.
        await deleteBoard(boardId);
        setConfirmOpen(false);
        toast.success("Board deleted");
      } catch {
        toast.error("Couldn't delete this board");
      }
    });
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label="Board options">
            <DotsThreeIcon weight="bold" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={copyLink}>
            <LinkIcon />
            Copy link
          </DropdownMenuItem>
          {canDelete && (
            <DropdownMenuItem
              variant="destructive"
              onSelect={() => setConfirmOpen(true)}
            >
              <TrashIcon />
              Delete
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete {boardName}?</DialogTitle>
            <DialogDescription>
              Everything on this board will be deleted for you and anyone it is
              shared with. This can&rsquo;t be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Cancel</Button>
            </DialogClose>
            <Button
              variant="destructive"
              disabled={deleting}
              onClick={confirmDelete}
            >
              {deleting ? "Deleting…" : "Delete board"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
