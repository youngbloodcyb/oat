"use client";

import { ChatCircleIcon, XIcon } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar";

export function ChatSidebar() {
  const { toggleSidebar } = useSidebar();

  return (
    <Sidebar side="right">
      <SidebarHeader className="flex-row items-center justify-between">
        <h2 className="px-2 text-sm font-medium">Chat</h2>
        <Button variant="ghost" size="icon-sm" onClick={toggleSidebar}>
          <XIcon />
          <span className="sr-only">Close chat</span>
        </Button>
      </SidebarHeader>
      <SidebarContent />
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
      className="absolute top-4 right-44 z-50"
      onClick={toggleSidebar}
    >
      <ChatCircleIcon />
      Chat
    </Button>
  );
}
