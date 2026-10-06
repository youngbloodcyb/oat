import { defineTool } from "eve/tools";
import { type RemovedNode, removeFromBoardSchema } from "@/lib/board-changes";
import { nodeSearchText, nodeSearchTitle } from "@/lib/node-search";
import { requireBoardAccess, requireNodeAccess } from "@/services/board-access";
import { deleteNode } from "@/services/node-writes";
import { requireCallerId } from "../lib/caller";

/** The node, if the user can edit it and it sits on this board. */
async function editableNodeOnBoard(
  nodeId: string,
  boardId: string,
  userId: string,
) {
  try {
    const { node } = await requireNodeAccess(nodeId, userId, "edit");
    return node.boardId === boardId ? node : null;
  } catch {
    return null;
  }
}

export default defineTool({
  description:
    "Delete items from the person's Oat board. The person sees an approval card listing every item and must approve before anything is deleted. Use it only when they ask you to remove something; get ids from the board tools.",
  inputSchema: removeFromBoardSchema,
  // Every call waits for the person. Requests they couldn't carry out (view
  // access, or ids that aren't on this board) are refused before any card.
  approval: async ({ session, toolInput }) => {
    const caller = session.auth.current;
    if (!caller || caller.principalType !== "user" || !toolInput?.boardId) {
      return { type: "denied", reason: "A signed-in Oat user is required." };
    }
    const { boardId, nodeIds = [] } = toolInput;
    try {
      await requireBoardAccess(boardId, caller.principalId, "edit");
    } catch {
      return { type: "denied", reason: "This person can only view the board." };
    }
    for (const nodeId of nodeIds) {
      if (!(await editableNodeOnBoard(nodeId, boardId, caller.principalId))) {
        return {
          type: "denied",
          reason: `No item with id ${nodeId} on this board. Check the ids with the board tools.`,
        };
      }
    }
    return "user-approval";
  },
  label: {
    start: ({ nodeIds }) =>
      `Deleting ${nodeIds.length} item${nodeIds.length === 1 ? "" : "s"} from the board`,
  },
  async execute({ boardId, nodeIds }, ctx) {
    const userId = requireCallerId(ctx);
    await requireBoardAccess(boardId, userId, "edit");

    const removed: RemovedNode[] = [];
    // Items someone else deleted while the card waited are skipped, not errors.
    const missing: string[] = [];
    for (const nodeId of new Set(nodeIds)) {
      const node = await editableNodeOnBoard(nodeId, boardId, userId);
      if (!node) {
        missing.push(nodeId);
        continue;
      }
      await deleteNode({ userId, nodeId });
      removed.push({
        id: node.id,
        type: node.type,
        title: nodeSearchTitle(node.data, nodeSearchText(node.data)),
      });
    }
    return { removed, missing };
  },
});
