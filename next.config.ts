import type { NextConfig } from "next";
import { withWorkflow } from "workflow/next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["ioredis", "ws"],
};

export default withWorkflow(nextConfig);
