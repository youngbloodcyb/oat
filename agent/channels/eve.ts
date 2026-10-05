import { localDev, vercelOidc } from "eve/channels/auth";
import { eveChannel } from "eve/channels/eve";
import { oatSessionAuth } from "@/lib/eve-auth";

export default eveChannel({
  auth: [
    // Signed-in browser users, identified by their Better Auth session.
    oatSessionAuth,
    // Lets the eve TUI and your Vercel deployments reach the deployed agent.
    vercelOidc(),
    // Open on localhost for `eve dev` and the REPL; ignored in production.
    localDev(),
  ],
  uploadPolicy: "disabled",
});
