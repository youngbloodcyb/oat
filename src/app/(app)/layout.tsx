import type { ReactNode } from "react";
import { ChatSidebarProvider } from "@/components/chat-sidebar-provider";

export default function AppLayout({ children }: { children: ReactNode }) {
  return <ChatSidebarProvider>{children}</ChatSidebarProvider>;
}
