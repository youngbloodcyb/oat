import type { XYPosition } from "@xyflow/react";
import { useMutation } from "convex/react";
import { useCallback } from "react";
import { toast } from "sonner";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import type { NodeData, NodeType } from "../../convex/nodes";
import type { NodeDraft } from "@/lib/board-utils";
import { DEFAULT_STYLE } from "@/lib/store";

/**
 * Standalone data-only update, for nodes that edit their own payload (e.g. a
 * link node backfilling OG metadata) and don't have a board id in scope.
 */
export function useUpdateNodeData() {
  const update = useMutation(api.nodes.update);
  return useCallback(
    (nodeId: string, data: NodeData) =>
      update({ nodeId: nodeId as Id<"nodes">, data }),
    [update],
  );
}

/**
 * Write actions for a board. All node mutations funnel through here so the
 * upload-then-create flow and optimistic cache updates live in one place.
 */
export function useBoardActions(boardId: Id<"boards">) {
  const create = useMutation(api.nodes.create);
  const generateUploadUrl = useMutation(api.nodes.generateUploadUrl);

  const move = useMutation(api.nodes.update).withOptimisticUpdate(
    (localStore, { nodeId, position }) => {
      if (!position) return;
      const cur = localStore.getQuery(api.nodes.listByBoard, { boardId });
      if (!cur) return;
      localStore.setQuery(
        api.nodes.listByBoard,
        { boardId },
        cur.map((n) => (n._id === nodeId ? { ...n, position } : n)),
      );
    },
  );

  const update = useMutation(api.nodes.update);

  const destroy = useMutation(api.nodes.remove).withOptimisticUpdate(
    (localStore, { nodeId }) => {
      const cur = localStore.getQuery(api.nodes.listByBoard, { boardId });
      if (!cur) return;
      localStore.setQuery(
        api.nodes.listByBoard,
        { boardId },
        cur.filter((n) => n._id !== nodeId),
      );
    },
  );

  const upload = useCallback(
    async (file: File): Promise<Id<"_storage">> => {
      const url = await generateUploadUrl();
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": file.type },
        body: file,
      });
      if (!res.ok) throw new Error("Upload failed");
      const { storageId } = (await res.json()) as { storageId: Id<"_storage"> };
      return storageId;
    },
    [generateUploadUrl],
  );

  // Turn a detected draft into the stored node data, uploading files first.
  const draftToData = useCallback(
    async (draft: NodeDraft): Promise<NodeData> => {
      switch (draft.kind) {
        case "link":
          return { kind: "link", url: draft.url };
        case "image":
          return { kind: "image", storageId: await upload(draft.file), alt: draft.alt };
        case "pdf":
          return "file" in draft
            ? { kind: "pdf", storageId: await upload(draft.file), name: draft.name }
            : { kind: "pdf", url: draft.url, name: draft.name };
      }
    },
    [upload],
  );

  const addDraft = useCallback(
    async (draft: NodeDraft, position: XYPosition) => {
      try {
        const data = await draftToData(draft);
        await create({
          boardId,
          type: draft.kind as NodeType,
          position,
          data,
          style: DEFAULT_STYLE[draft.kind],
        });
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Couldn't add node");
      }
    },
    [boardId, create, draftToData],
  );

  const moveNode = useCallback(
    (nodeId: string, position: XYPosition) =>
      move({ nodeId: nodeId as Id<"nodes">, position }),
    [move],
  );

  const removeNode = useCallback(
    (nodeId: string) => destroy({ nodeId: nodeId as Id<"nodes"> }),
    [destroy],
  );

  const setNodeData = useCallback(
    (nodeId: string, data: NodeData) =>
      update({ nodeId: nodeId as Id<"nodes">, data }),
    [update],
  );

  return { addDraft, moveNode, removeNode, setNodeData };
}
