import { ucpProfile } from "@/lib/ucp-profile";

export function GET() {
  // UCP requires a public, cacheable profile with a max-age of at least 60s.
  return Response.json(ucpProfile, {
    headers: { "cache-control": "public, max-age=300" },
  });
}
