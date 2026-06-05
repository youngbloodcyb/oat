"use client";

import { Authenticated, AuthLoading, Unauthenticated } from "convex/react";

import { AuthForm } from "@/components/auth-form";
import { Loading } from "@/components/loading";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";

/** Gates everything in the (app) route group behind auth. */
export function AuthGate({ children }: { children: React.ReactNode }) {
  return (
    <>
      <AuthLoading>
        <Loading />
      </AuthLoading>

      <Unauthenticated>
        <div className="flex min-h-screen items-center justify-center p-6">
          <AuthForm />
        </div>
      </Unauthenticated>

      <Authenticated>
        {children}
        <Button
          variant="outline"
          size="sm"
          onClick={() => authClient.signOut()}
          className="fixed top-4 right-4 z-50"
        >
          Sign out
        </Button>
      </Authenticated>
    </>
  );
}
