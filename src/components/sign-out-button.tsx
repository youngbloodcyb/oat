"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useSidebar } from "@/components/ui/sidebar";
import { authClient } from "@/lib/auth-client";
import { cn } from "@/lib/utils";

export function SignOutButton() {
  const router = useRouter();
  const { open, isMobile } = useSidebar();

  const onSignOut = async () => {
    await authClient.signOut();
    router.push("/login");
  };

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={onSignOut}
      className={cn(
        "fixed top-4 right-4 z-50 transition-[right] duration-200 ease-linear",
        open && !isMobile && "right-[calc(var(--sidebar-width)+1rem)]",
      )}
    >
      Sign out
    </Button>
  );
}
