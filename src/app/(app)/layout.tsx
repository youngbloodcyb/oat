import type { CSSProperties, ReactNode } from "react";
import { SignOutButton } from "@/components/sign-out-button";
import { SidebarProvider } from "@/components/ui/sidebar";

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <SidebarProvider
      defaultOpen={false}
      style={{ "--sidebar-width": "28rem" } as CSSProperties}
    >
      {children}
      <SignOutButton />
    </SidebarProvider>
  );
}
