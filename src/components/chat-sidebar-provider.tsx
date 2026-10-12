"use client";

import {
  type CSSProperties,
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { SidebarProvider, useSidebar } from "@/components/ui/sidebar";

const STORAGE_KEY = "oat:chat-sidebar-open";

/** What the right sidebar shows. */
export type SidebarPanel = "chat" | "palette";

const SidebarPanelContext = createContext<{
  panel: SidebarPanel;
  setPanel: (panel: SidebarPanel) => void;
} | null>(null);

/**
 * The right sidebar's current panel. `togglePanel` opens the sidebar on a
 * panel, switches to it if another is showing, or closes it if it already is.
 */
export function useSidebarPanel() {
  const context = useContext(SidebarPanelContext);
  if (!context) {
    throw new Error("useSidebarPanel must be used within ChatSidebarProvider.");
  }
  const { panel, setPanel } = context;
  const { open, openMobile, isMobile, toggleSidebar } = useSidebar();
  const isOpen = isMobile ? openMobile : open;

  const togglePanel = useCallback(
    (next: SidebarPanel) => {
      if (isOpen && panel === next) {
        toggleSidebar();
        return;
      }
      setPanel(next);
      if (!isOpen) toggleSidebar();
    },
    [isOpen, panel, setPanel, toggleSidebar],
  );

  return { panel, isOpen, togglePanel };
}

/** Remembers whether the chat sidebar was open and reopens it on return. */
export function ChatSidebarProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [panel, setPanelState] = useState<SidebarPanel>("chat");
  // Read when persisting, which can happen in the same tick as a switch.
  const panelRef = useRef(panel);

  useEffect(() => {
    try {
      if (localStorage.getItem(STORAGE_KEY) === "true") setOpen(true);
    } catch {
      // Storage can be unavailable (private mode, blocked site data).
    }
  }, []);

  const setPanel = useCallback((next: SidebarPanel) => {
    panelRef.current = next;
    setPanelState(next);
  }, []);

  const onOpenChange = useCallback((next: boolean) => {
    setOpen(next);
    // Only the chat is reopened on return.
    try {
      localStorage.setItem(
        STORAGE_KEY,
        String(next && panelRef.current === "chat"),
      );
    } catch {}
  }, []);

  const value = useMemo(() => ({ panel, setPanel }), [panel, setPanel]);

  return (
    <SidebarPanelContext value={value}>
      <SidebarProvider
        open={open}
        onOpenChange={onOpenChange}
        style={{ "--sidebar-width": "28rem" } as CSSProperties}
      >
        {children}
      </SidebarProvider>
    </SidebarPanelContext>
  );
}
