"use client";

import { useState } from "react";
import { Controller, type Resolver, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";

import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";

const signInSchema = z.object({
  email: z.email("Enter a valid email"),
  password: z.string().min(8, "At least 8 characters"),
});

const signUpSchema = signInSchema.extend({
  name: z.string().min(1, "Name is required"),
});

type FormValues = z.infer<typeof signUpSchema>;

type Mode = "signin" | "signup";

function AuthFormInner({
  mode,
  onToggle,
}: {
  mode: Mode;
  onToggle: () => void;
}) {
  const isSignUp = mode === "signup";
  const form = useForm<FormValues>({
    resolver: zodResolver(
      isSignUp ? signUpSchema : signInSchema,
    ) as unknown as Resolver<FormValues>,
    defaultValues: { name: "", email: "", password: "" },
  });

  const onSubmit = async (values: FormValues) => {
    const res = isSignUp
      ? await authClient.signUp.email({
          name: values.name,
          email: values.email,
          password: values.password,
        })
      : await authClient.signIn.email({
          email: values.email,
          password: values.password,
        });

    // On success the ConvexBetterAuthProvider picks up the token and the
    // <Authenticated> gate swaps in the board — no manual redirect needed.
    if (res.error) {
      toast.error(res.error.message ?? "Something went wrong");
      return;
    }
    toast.success(isSignUp ? "Account created" : "Welcome back");
  };

  return (
    <form
      onSubmit={form.handleSubmit(onSubmit)}
      className="w-full max-w-sm rounded-lg border bg-background p-6"
    >
      <FieldGroup>
        <div className="flex flex-col gap-1">
          <h1 className="text-lg font-semibold">
            {isSignUp ? "Create your account" : "Welcome back"}
          </h1>
          <FieldDescription>
            {isSignUp
              ? "Sign up to start moodboarding."
              : "Log in to your boards."}
          </FieldDescription>
        </div>

        {isSignUp && (
          <Controller
            name="name"
            control={form.control}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor="name">Name</FieldLabel>
                <Input
                  id="name"
                  autoComplete="name"
                  aria-invalid={fieldState.invalid}
                  {...field}
                />
                <FieldError errors={[fieldState.error]} />
              </Field>
            )}
          />
        )}

        <Controller
          name="email"
          control={form.control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor="email">Email</FieldLabel>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                aria-invalid={fieldState.invalid}
                {...field}
              />
              <FieldError errors={[fieldState.error]} />
            </Field>
          )}
        />

        <Controller
          name="password"
          control={form.control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor="password">Password</FieldLabel>
              <Input
                id="password"
                type="password"
                autoComplete={isSignUp ? "new-password" : "current-password"}
                aria-invalid={fieldState.invalid}
                {...field}
              />
              <FieldError errors={[fieldState.error]} />
            </Field>
          )}
        />

        <Field>
          <Button type="submit" disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting
              ? "…"
              : isSignUp
                ? "Sign up"
                : "Log in"}
          </Button>
        </Field>

        <FieldDescription className="text-center">
          {isSignUp ? "Already have an account? " : "Need an account? "}
          <button
            type="button"
            onClick={onToggle}
            className="underline underline-offset-4 hover:text-primary"
          >
            {isSignUp ? "Log in" : "Sign up"}
          </button>
        </FieldDescription>
      </FieldGroup>
    </form>
  );
}

export function AuthForm() {
  const [mode, setMode] = useState<Mode>("signin");
  // Remount on mode change so the resolver + field state reset cleanly.
  return (
    <AuthFormInner
      key={mode}
      mode={mode}
      onToggle={() => setMode(mode === "signin" ? "signup" : "signin")}
    />
  );
}
