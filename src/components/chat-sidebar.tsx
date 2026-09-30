"use client";

import { ChatCircleIcon } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  useSidebar,
} from "@/components/ui/sidebar";

export function ChatSidebar() {
  return (
    <Sidebar side="right">
      <SidebarHeader>
        <h2 className="px-2 text-sm font-medium">Chat</h2>
      </SidebarHeader>
      <SidebarContent />
    </Sidebar>
  );
}

export function ChatSidebarTrigger() {
  const { toggleSidebar } = useSidebar();

  return (
    <Button
      variant="outline"
      size="sm"
      className="fixed top-4 right-44 z-50"
      onClick={toggleSidebar}
    >
      <ChatCircleIcon />
      Chat
    </Button>
  );
}
