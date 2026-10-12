"use client";

import { SparkleIcon, XIcon } from "@phosphor-icons/react";
import { type CSSProperties, Suspense, useEffect, useState } from "react";
import { BoardPalette } from "@/components/board-palette";
import { BoardChat } from "@/components/chat/board-chat";
import { useSidebarPanel } from "@/components/chat-sidebar-provider";
import { Button } from "@/components/ui/button";
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarRail,
  SidebarSeparator,
  useSidebar,
} from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";
import type { SavedBoardChat } from "@/services/board-chats";
import type { ImagePalette } from "@/services/palettes";

export function ChatSidebar({
  boardId,
  boardName,
  chat,
  palettes,
}: {
  boardId: string;
  boardName: string;
  chat: SavedBoardChat | null;
  palettes: Promise<ImagePalette[]>;
}) {
  const { toggleSidebar } = useSidebar();
  const { panel, isOpen } = useSidebarPanel();
  const showingChat = isOpen && panel === "chat";
  // Don't open an agent stream until the chat is actually used. Once it is,
  // keep it mounted while the palette shows so the conversation survives.
  const [hasOpenedChat, setHasOpenedChat] = useState(showingChat);
  useEffect(() => {
    if (showingChat) setHasOpenedChat(true);
  }, [showingChat]);

  return (
    <Sidebar
      side="right"
      style={{ "--sidebar": "var(--background)" } as CSSProperties}
    >
      <SidebarHeader className="h-10 flex-row items-center justify-between">
        <span className="px-2 text-sm font-medium">
          {panel === "palette" ? "Palette" : null}
        </span>
        <Button variant="ghost" size="icon-sm" onClick={toggleSidebar}>
          <XIcon />
          <span className="sr-only">
            Close {panel === "palette" ? "palette" : "chat"}
          </span>
        </Button>
      </SidebarHeader>
      <SidebarSeparator className="mx-0 w-full" />
      <SidebarContent className="gap-0 overflow-hidden">
        {hasOpenedChat && (
          <div
            className={cn(
              "flex min-h-0 flex-1 flex-col",
              panel !== "chat" && "hidden",
            )}
          >
            <BoardChat boardId={boardId} boardName={boardName} saved={chat} />
          </div>
        )}
        {panel === "palette" && isOpen && (
          // The page starts loading palettes, so this only suspends if the
          // panel opens before they arrive.
          <Suspense fallback={null}>
            <BoardPalette boardId={boardId} initialPalettes={palettes} />
          </Suspense>
        )}
      </SidebarContent>
      <SidebarRail />
    </Sidebar>
  );
}

export function ChatSidebarTrigger({ disabled }: { disabled?: boolean }) {
  const { togglePanel } = useSidebarPanel();

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={() => togglePanel("chat")}
      disabled={disabled}
      aria-label="Chat"
    >
      <SparkleIcon />
      <kbd className="ml-1 font-sans text-[0.625rem] tracking-widest text-muted-foreground">
        ⌘B
      </kbd>
    </Button>
  );
}
