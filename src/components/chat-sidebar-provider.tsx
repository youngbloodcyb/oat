"use client";

import {
  type CSSProperties,
  type ReactNode,
  useCallback,
  useEffect,
  useState,
} from "react";
import { SidebarProvider } from "@/components/ui/sidebar";

const STORAGE_KEY = "oat:chat-sidebar-open";

/** Remembers whether the chat sidebar was open and reopens it on return. */
export function ChatSidebarProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    try {
      if (localStorage.getItem(STORAGE_KEY) === "true") setOpen(true);
    } catch {
      // Storage can be unavailable (private mode, blocked site data).
    }
  }, []);

  const onOpenChange = useCallback((next: boolean) => {
    setOpen(next);
    try {
      localStorage.setItem(STORAGE_KEY, String(next));
    } catch {}
  }, []);

  return (
    <SidebarProvider
      open={open}
      onOpenChange={onOpenChange}
      style={{ "--sidebar-width": "28rem" } as CSSProperties}
    >
      {children}
    </SidebarProvider>
  );
}
