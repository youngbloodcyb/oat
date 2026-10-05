import { betterAuth } from "better-auth";
import { nextCookies, toNextJsHandler } from "better-auth/next-js";
import { headers } from "next/headers";
import { authOptions } from "@/lib/auth-options";

export const auth = betterAuth({
  ...authOptions,
  plugins: [nextCookies()],
});

export const handler = toNextJsHandler(auth);

export type Session = Awaited<ReturnType<typeof auth.api.getSession>>;

export async function getSession() {
  return auth.api.getSession({ headers: await headers() });
}

export async function requireUser() {
  const session = await getSession();
  if (!session?.user) throw new Error("Unauthorized");
  return session.user;
}
