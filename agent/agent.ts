import { defineAgent } from "eve";

export default defineAgent({
  model: "zai/glm-5.2",
  // Board tools only: no shell, file, or web access, so no sandbox is needed.
  defaultTools: false,
  limits: {
    // Board chats are long-lived; never expire the eve session.
    sessionTimeoutMs: false,
  },
});
