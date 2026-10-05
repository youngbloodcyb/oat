"use client";

import { CopyIcon, ShareNetworkIcon, TrashIcon } from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import type { BoardShareRole } from "@/db/schema";
import { cn } from "@/lib/utils";
import {
  addBoardShare,
  type BoardShareMember,
  removeBoardShare,
  updateBoardShare,
} from "@/services/shares";

const roleLabels: Record<BoardShareRole, string> = {
  editor: "Can edit",
  viewer: "Can view",
};

function messageFrom(error: unknown) {
  return error instanceof Error ? error.message : "Something went wrong";
}

export function SharingDialog({
  boardId,
  boardName,
  members: initialMembers,
  className,
}: {
  boardId: string;
  boardName: string;
  /** Loaded with the board; refreshed by each share action's revalidation. */
  members: BoardShareMember[];
  className?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [members, setMembers] = useState(initialMembers);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<BoardShareRole>("editor");
  const [saving, setSaving] = useState(false);

  // Local edits apply instantly; the server's list replaces them on refresh.
  useEffect(() => setMembers(initialMembers), [initialMembers]);

  const addMember = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!email.trim()) return;
    setSaving(true);
    try {
      await addBoardShare({ boardId, email, role });
      setEmail("");
      // Re-fetch the board so a newly shared board turns on realtime.
      router.refresh();
      toast.success("Board shared");
    } catch (error) {
      toast.error(messageFrom(error));
    } finally {
      setSaving(false);
    }
  };

  const changeRole = async (userId: string, nextRole: BoardShareRole) => {
    try {
      await updateBoardShare({ boardId, userId, role: nextRole });
      setMembers((current) =>
        current.map((member) =>
          member.userId === userId ? { ...member, role: nextRole } : member,
        ),
      );
    } catch (error) {
      toast.error(messageFrom(error));
    }
  };

  const removeMember = async (userId: string) => {
    try {
      await removeBoardShare({ boardId, userId });
      setMembers((current) =>
        current.filter((member) => member.userId !== userId),
      );
      toast.success("Access removed");
    } catch (error) {
      toast.error(messageFrom(error));
    }
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      toast.success("Board link copied");
    } catch {
      toast.error("Couldn't copy the board link");
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className={cn(className)}>
          <ShareNetworkIcon />
          Share
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Share {boardName}</DialogTitle>
          <DialogDescription>
            People must already have an Oat account before you can add them.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={addMember} className="flex items-center gap-2">
          <Input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="person@example.com"
            aria-label="Email address"
            required
          />
          <select
            value={role}
            onChange={(event) => setRole(event.target.value as BoardShareRole)}
            aria-label="Access role"
            className="h-7 rounded-md border border-input bg-transparent px-2 text-xs outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
          >
            <option value="editor">Can edit</option>
            <option value="viewer">Can view</option>
          </select>
          <Button type="submit" disabled={saving || !email.trim()}>
            {saving ? "Adding…" : "Add"}
          </Button>
        </form>

        <div className="space-y-2">
          <div className="text-xs font-medium">People with access</div>
          {members.length === 0 ? (
            <div className="rounded-md border border-dashed p-3 text-muted-foreground">
              Only you have access.
            </div>
          ) : (
            <ul className="divide-y rounded-md border">
              {members.map((member) => (
                <li
                  key={member.userId}
                  className="flex items-center gap-2 px-3 py-2"
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{member.name}</div>
                    <div className="truncate text-muted-foreground">
                      {member.email}
                    </div>
                  </div>
                  <select
                    value={member.role}
                    onChange={(event) =>
                      void changeRole(
                        member.userId,
                        event.target.value as BoardShareRole,
                      )
                    }
                    aria-label={`Access for ${member.email}`}
                    className="h-7 rounded-md border border-input bg-transparent px-2 text-xs outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
                  >
                    {Object.entries(roleLabels).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={`Remove ${member.email}`}
                    onClick={() => void removeMember(member.userId)}
                  >
                    <TrashIcon />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <Button type="button" variant="outline" onClick={copyLink}>
          <CopyIcon />
          Copy board link
        </Button>
      </DialogContent>
    </Dialog>
  );
}
