import { defineMcpClientConnection } from "eve/connections";
import { ucpProfileUrl } from "@/lib/ucp-profile";

// Shopify's Global Catalog: a public, read-only product search across Shopify
// merchants. It needs no credentials, only the UCP agent profile on each call.
export default defineMcpClientConnection({
  url: "https://catalog.shopify.com/api/ucp/mcp",
  description:
    "Shopify Global Catalog: search and look up products sold by Shopify merchants. Use it to find products, shop for items, or find products similar to something on the board.",
  tools: { allow: ["search_catalog", "lookup_catalog", "get_product"] },
  toolCall: {
    providedArguments: {
      meta: () => ({ "ucp-agent": { profile: ucpProfileUrl() } }),
    },
  },
});
