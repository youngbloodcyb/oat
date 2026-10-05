const UCP_VERSION = "2026-08-25";

/**
 * Oat's UCP agent profile, served at `/.well-known/ucp`. UCP servers such as
 * Shopify's Global Catalog fetch it on every call to learn what the agent
 * supports. Oat only searches and looks up products, so it declares no
 * checkout, cart, or payment capabilities.
 */
export const ucpProfile = {
  ucp: {
    version: UCP_VERSION,
    services: {
      "dev.ucp.shopping": [
        {
          version: UCP_VERSION,
          spec: `https://ucp.dev/${UCP_VERSION}/specification/overview`,
          transport: "mcp",
          schema: `https://ucp.dev/${UCP_VERSION}/services/shopping/mcp.openrpc.json`,
        },
      ],
    },
    capabilities: {
      "dev.ucp.shopping.catalog.search": [
        {
          version: UCP_VERSION,
          spec: `https://ucp.dev/${UCP_VERSION}/specification/catalog/search`,
          schema: `https://ucp.dev/${UCP_VERSION}/schemas/shopping/catalog_search.json`,
        },
      ],
      "dev.ucp.shopping.catalog.lookup": [
        {
          version: UCP_VERSION,
          spec: `https://ucp.dev/${UCP_VERSION}/specification/catalog/lookup`,
          schema: `https://ucp.dev/${UCP_VERSION}/schemas/shopping/catalog_lookup.json`,
        },
      ],
      "dev.shopify.catalog.global": [
        {
          version: UCP_VERSION,
          spec: "https://shopify.dev/docs/agents/catalog/global-catalog",
          schema: `https://shopify.dev/ucp/schemas/${UCP_VERSION}/shopify_catalog_global.json`,
          extends: [
            "dev.ucp.shopping.catalog.lookup",
            "dev.ucp.shopping.catalog.search",
          ],
        },
      ],
    },
    payment_handlers: {},
  },
};

// Shopify's published example profile. The UCP server must be able to fetch
// the profile, which localhost and protected preview deployments can't serve.
const EXAMPLE_PROFILE_URL = `https://shopify.dev/ucp/agent-profiles/examples/${UCP_VERSION}/valid-with-capabilities.json`;

/** The public URL UCP servers fetch Oat's profile from. */
export function ucpProfileUrl() {
  const host = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (process.env.VERCEL_ENV === "production" && host) {
    return `https://${host}/.well-known/ucp`;
  }
  return EXAMPLE_PROFILE_URL;
}
