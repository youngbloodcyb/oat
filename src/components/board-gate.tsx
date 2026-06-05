"use client";

import { Authenticated, AuthLoading, Unauthenticated } from "convex/react";

import { Board } from "@/app/board";
import { AuthForm } from "@/components/auth-form";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";

export function BoardGate() {
  return (
    <>
      <AuthLoading>
        <div className="flex min-h-screen items-center justify-center text-muted-foreground">
          Loading…
        </div>
      </AuthLoading>

      <Unauthenticated>
        <div className="flex min-h-screen items-center justify-center p-6">
          <AuthForm />
        </div>
      </Unauthenticated>

      <Authenticated>
        <Board />
        <Button
          variant="outline"
          size="sm"
          onClick={() => authClient.signOut()}
          className="fixed top-4 right-4 z-10"
        >
          Sign out
        </Button>
      </Authenticated>
    </>
  );
}
