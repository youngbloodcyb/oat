"use client";

import {
  DotsThreeIcon,
  LinkIcon,
  SignOutIcon,
  TrashIcon,
} from "@phosphor-icons/react";
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
import { leaveBoard } from "@/services/shares";

// Owners can delete the board; members it's shared with can leave it.
export function BoardCardMenu({
  boardId,
  boardName,
  isOwner,
}: {
  boardId: string;
  boardName: string;
  isOwner: boolean;
}) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pending, startTransition] = useTransition();

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

  const confirm = () => {
    startTransition(async () => {
      try {
        // Both actions revalidate the boards list, removing this card.
        if (isOwner) {
          await deleteBoard(boardId);
          toast.success("Board deleted");
        } else {
          await leaveBoard(boardId);
          toast.success("Left board");
        }
        setConfirmOpen(false);
      } catch {
        toast.error(
          isOwner ? "Couldn't delete this board" : "Couldn't leave this board",
        );
      }
    });
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-lg" aria-label="Board options">
            <DotsThreeIcon weight="bold" className="size-5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={copyLink}>
            <LinkIcon />
            Copy link
          </DropdownMenuItem>
          <DropdownMenuItem
            variant="destructive"
            onSelect={() => setConfirmOpen(true)}
          >
            {isOwner ? <TrashIcon /> : <SignOutIcon />}
            {isOwner ? "Delete" : "Leave"}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>
              {isOwner ? "Delete" : "Leave"} {boardName}?
            </DialogTitle>
            <DialogDescription>
              {isOwner
                ? "Everything on this board will be deleted for you and anyone it is shared with. This can’t be undone."
                : "You’ll lose access to this board. The owner will need to share it with you again for you to get it back."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Cancel</Button>
            </DialogClose>
            <Button variant="destructive" disabled={pending} onClick={confirm}>
              {isOwner
                ? pending
                  ? "Deleting…"
                  : "Delete board"
                : pending
                  ? "Leaving…"
                  : "Leave board"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
