"use client";

import { ChatCircleIcon, XIcon } from "@phosphor-icons/react";
import type { CSSProperties } from "react";
import { Button } from "@/components/ui/button";
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarRail,
  SidebarSeparator,
  useSidebar,
} from "@/components/ui/sidebar";

export function ChatSidebar() {
  const { toggleSidebar } = useSidebar();

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
      <SidebarContent />
      <SidebarRail />
    </Sidebar>
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
