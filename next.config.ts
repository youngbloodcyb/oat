import type { NextConfig } from "next";
import { withWorkflow } from "workflow/next";
import { withEve } from "eve/next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  experimental: {
    // Only validate segments that opt in with `export const instant`.
    instantInsights: { validationLevel: "manual-warning" },
  },
  serverExternalPackages: ["ioredis", "ws"],
};

export default withEve(withWorkflow(nextConfig));
