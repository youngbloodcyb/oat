"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Controller, type Resolver, useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { authClient } from "@/lib/auth-client";

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
  const router = useRouter();
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

    // On success redirect to the boards page.
    if (res.error) {
      toast.error(res.error.message ?? "Something went wrong");
      return;
    }
    toast.success(isSignUp ? "Account created" : "Welcome back");
    router.push("/");
    router.refresh();
  };

  return (
    <form
      onSubmit={form.handleSubmit(onSubmit)}
      className="w-full max-w-sm rounded-lg border bg-background p-6"
    >
      <FieldGroup>
        <h1 className="text-center font-mono text-lg font-medium uppercase">
          oat.club
        </h1>

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
