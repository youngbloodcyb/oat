import type { ToolContext } from "eve/tools";

/**
 * The signed-in Oat user on the active turn. Tools authorize every board and
 * node against this id; ids the model passes in are never trusted on their own.
 */
export function requireCallerId(ctx: ToolContext): string {
  const caller = ctx.session.auth.current;
  if (!caller || caller.principalType !== "user") {
    throw new Error("A signed-in Oat user is required");
  }
  return caller.principalId;
}
