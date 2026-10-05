import { getVercelOidcToken } from "@vercel/oidc";
import { Client } from "eve/client";

/**
 * An eve client for server code, such as retiring a deleted board's chat
 * sessions. On Vercel it calls this deployment with the project's OIDC
 * token, which both the eve channel's `vercelOidc()` auth and deployment
 * protection accept. Locally, `localDev()` admits the request.
 */
export function eveServerClient(): Client {
  if (process.env.VERCEL_URL) {
    return new Client({
      host: `https://${process.env.VERCEL_URL}`,
      auth: { vercelOidc: { token: () => getVercelOidcToken() } },
    });
  }
  return new Client({ host: process.env.SITE_URL ?? "http://localhost:3000" });
}
