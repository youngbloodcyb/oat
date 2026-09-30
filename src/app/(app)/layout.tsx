import type { ReactNode } from "react";
import { SignOutButton } from "@/components/sign-out-button";
import { SidebarProvider } from "@/components/ui/sidebar";

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <SidebarProvider defaultOpen={false}>
      {children}
      <SignOutButton />
    </SidebarProvider>
  );
}
