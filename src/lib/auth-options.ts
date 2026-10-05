import type { BetterAuthOptions } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "@/db";
import { account, jwks, session, user, verification } from "@/db/schema";

// Framework-free so the eve agent runtime can verify the same sessions as
// the Next.js app. Next-only plugins are added in `auth-server.ts`.
export const authOptions = {
  appName: "My App",
  baseURL: process.env.SITE_URL,
  secret: process.env.BETTER_AUTH_SECRET,
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: { user, session, account, verification, jwks },
  }),
  emailAndPassword: {
    enabled: true,
  },
} satisfies BetterAuthOptions;
