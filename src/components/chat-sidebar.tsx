"use client";

import { ChatCircleIcon, TrashIcon, XIcon } from "@phosphor-icons/react";
import { type CSSProperties, useEffect, useState } from "react";
import { toast } from "sonner";
import { BoardChat } from "@/components/chat/board-chat";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarRail,
  SidebarSeparator,
  useSidebar,
} from "@/components/ui/sidebar";
import { clearBoardChat } from "@/services/board-chats";

export function ChatSidebar({
  boardId,
  boardName,
}: {
  boardId: string;
  boardName: string;
}) {
  const { open, openMobile, isMobile, toggleSidebar } = useSidebar();
  const isOpen = isMobile ? openMobile : open;
  // Don't open an agent stream until the chat is actually used.
  const [hasOpened, setHasOpened] = useState(isOpen);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    if (isOpen) setHasOpened(true);
  }, [isOpen]);

  const clearChat = async () => {
    try {
      const sessionId = await clearBoardChat(boardId);
      if (sessionId) {
        // Retire the old eve session so its stored state can expire.
        void fetch(`/eve/v1/session/${encodeURIComponent(sessionId)}/reset`, {
          method: "POST",
        }).catch(() => {});
      }
      setVersion((v) => v + 1);
    } catch {
      toast.error("Couldn't clear this chat");
    }
  };

  return (
    <Sidebar
      side="right"
      style={{ "--sidebar": "var(--background)" } as CSSProperties}
    >
      <SidebarHeader className="h-10 flex-row items-center justify-between">
        <span className="pl-1 text-xs font-medium">Assistant</span>
        <div className="flex items-center gap-1">
          <ClearChatButton onConfirm={clearChat} />
          <Button variant="ghost" size="icon-sm" onClick={toggleSidebar}>
            <XIcon />
            <span className="sr-only">Close chat</span>
          </Button>
        </div>
      </SidebarHeader>
      <SidebarSeparator className="mx-0 w-full" />
      <SidebarContent className="gap-0 overflow-hidden">
        {hasOpened && (
          <BoardChat
            boardId={boardId}
            boardName={boardName}
            version={version}
          />
        )}
      </SidebarContent>
      <SidebarRail />
    </Sidebar>
  );
}

function ClearChatButton({ onConfirm }: { onConfirm: () => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon-sm">
          <TrashIcon />
          <span className="sr-only">Clear chat</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Clear this chat?</DialogTitle>
          <DialogDescription>
            The conversation will be deleted and the assistant will start fresh.
            This can&rsquo;t be undone.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Cancel</Button>
          </DialogClose>
          <Button
            variant="destructive"
            disabled={pending}
            onClick={async () => {
              setPending(true);
              await onConfirm();
              setPending(false);
              setOpen(false);
            }}
          >
            Clear chat
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ChatSidebarTrigger() {
  const { toggleSidebar } = useSidebar();

  return (
    <Button variant="outline" size="sm" onClick={toggleSidebar}>
      <ChatCircleIcon />
      Chat
    </Button>
  );
}
