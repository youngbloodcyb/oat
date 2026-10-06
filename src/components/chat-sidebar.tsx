"use client";

import { ChatCircleIcon, XIcon } from "@phosphor-icons/react";
import { type CSSProperties, useEffect, useState } from "react";
import { BoardChat } from "@/components/chat/board-chat";
import { Button } from "@/components/ui/button";
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarRail,
  SidebarSeparator,
  useSidebar,
} from "@/components/ui/sidebar";
import type { SavedBoardChat } from "@/services/board-chats";

export function ChatSidebar({
  boardId,
  boardName,
  chat,
}: {
  boardId: string;
  boardName: string;
  chat: SavedBoardChat | null;
}) {
  const { open, openMobile, isMobile, toggleSidebar } = useSidebar();
  const isOpen = isMobile ? openMobile : open;
  // Don't open an agent stream until the chat is actually used.
  const [hasOpened, setHasOpened] = useState(isOpen);
  useEffect(() => {
    if (isOpen) setHasOpened(true);
  }, [isOpen]);

  return (
    <Sidebar
      side="right"
      style={{ "--sidebar": "var(--background)" } as CSSProperties}
    >
      <SidebarHeader className="h-10 flex-row items-center justify-end">
        <Button variant="ghost" size="icon-sm" onClick={toggleSidebar}>
          <XIcon />
          <span className="sr-only">Close chat</span>
        </Button>
      </SidebarHeader>
      <SidebarSeparator className="mx-0 w-full" />
      <SidebarContent className="gap-0 overflow-hidden">
        {hasOpened && (
          <BoardChat boardId={boardId} boardName={boardName} saved={chat} />
        )}
      </SidebarContent>
      <SidebarRail />
    </Sidebar>
  );
}

export function ChatSidebarTrigger() {
  const { toggleSidebar } = useSidebar();

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={toggleSidebar}
      aria-label="Chat"
    >
      <ChatCircleIcon />
      <kbd className="ml-1 font-sans text-[0.625rem] tracking-widest text-muted-foreground">
        ⌘B
      </kbd>
    </Button>
  );
}
