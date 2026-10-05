import { betterAuth } from "better-auth";
import type { AuthFn } from "eve/channels/auth";
import { authOptions } from "@/lib/auth-options";

// A separate instance without `nextCookies()`: this runs inside the eve
// runtime, where `next/headers` is unavailable.
const auth = betterAuth(authOptions);

/** Admits browser requests that carry a valid Oat session cookie. */
export const oatSessionAuth: AuthFn<Request> = async (request) => {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user) return null;

  return {
    attributes: {
      email: session.user.email,
      name: session.user.name,
    },
    authenticator: "better-auth",
    issuer: "oat",
    principalId: session.user.id,
    principalType: "user",
    subject: session.user.email,
  };
};
