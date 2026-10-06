import { upload as uploadBlob } from "@vercel/blob/client";
import type { XYPosition } from "@xyflow/react";
import { useCallback, useRef } from "react";
import { toast } from "sonner";
import type { NodeData, NodeType } from "@/db/schema";
import { authClient } from "@/lib/auth-client";
import { objectKeyFor } from "@/lib/blob";
import type { NodeDraft } from "@/lib/board-utils";
import { embedNodeSize, parseEmbed } from "@/lib/embed";
import { extractPdfMarkdown } from "@/lib/pdf-parser";
import { getRealtimeClientId } from "@/lib/realtime-client-id";
import {
  type BoardNode,
  DEFAULT_STYLE,
  nodeSize,
  type PendingNode,
  type PendingNodePreview,
  toClientNodeData,
  useBoardStore,
} from "@/lib/store";
import { uploadSizeError } from "@/lib/upload-policy";
import {
  createNode,
  duplicateNode as duplicateNodeAction,
  patchImageNode,
  removeNode as removeNodeAction,
  updateNode,
} from "@/services/nodes";

/** Add a freshly created node to the local store so it shows immediately. */
function addNodeLocal(node: BoardNode) {
  useBoardStore.getState().upsertRemoteNode(node);
}

function pendingPreview(draft: NodeDraft): PendingNodePreview {
  switch (draft.kind) {
    case "link":
      return { kind: "link", url: draft.url };
    case "text":
      return { kind: "text", text: draft.text };
    case "image":
      return {
        kind: "image",
        src: URL.createObjectURL(draft.file),
        alt: draft.alt,
      };
    case "pdf":
      return "file" in draft
        ? {
            kind: "pdf",
            src: URL.createObjectURL(draft.file),
            name: draft.name,
          }
        : { kind: "pdf", src: draft.url, name: draft.name };
  }
}

/** Starting size for a draft's node: a link that plays inline fits its player. */
function draftStyle(draft: NodeDraft): { width: number; height: number } {
  const embed = draft.kind === "link" ? parseEmbed(draft.url) : null;
  return embed ? embedNodeSize(embed) : DEFAULT_STYLE[draft.kind];
}

/** A stacking order above every node on the board. */
function frontZIndex(): number {
  return (
    Math.max(0, ...useBoardStore.getState().nodes.map((n) => n.zIndex ?? 0)) + 1
  );
}

const isFileDraft = (
  draft: NodeDraft,
): draft is Extract<NodeDraft, { file: File }> => "file" in draft;

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Couldn't add node";
}

function positionsMatch(a: XYPosition, b: XYPosition): boolean {
  return a.x === b.x && a.y === b.y;
}

/**
 * Standalone data-only update, for nodes that edit their own payload (e.g. a
 * link node backfilling OG metadata) and don't have a board id in scope.
 */
export function useUpdateNodeData() {
  return useCallback((nodeId: string, data: NodeData) => {
    updateNode({
      nodeId,
      data,
      realtimeSourceId: getRealtimeClientId(),
    }).catch((e) => console.error("node update failed", e));
  }, []);
}

/**
 * Write actions for a board. All node mutations funnel through here so the
 * upload-then-create flow and optimistic cache updates live in one place.
 */
export function useBoardActions(boardId: string) {
  const { data: session } = authClient.useSession();
  const userId = session?.user?.id;
  const processingPendingIds = useRef(new Set<string>());

  const uploadFile = useCallback(
    async (
      file: File,
      onProgress?: (percentage: number) => void,
    ): Promise<string> => {
      if (!userId) throw new Error("Not signed in");
      const sizeError = uploadSizeError(file);
      if (sizeError) throw new Error(sizeError);
      const pathname = objectKeyFor(userId, boardId);
      const { pathname: stored } = await uploadBlob(pathname, file, {
        access: "private",
        handleUploadUrl: "/api/blob/upload",
        clientPayload: boardId,
        contentType: file.type,
        onUploadProgress: ({ percentage }) => onProgress?.(percentage),
      });
      return stored;
    },
    [userId, boardId],
  );

  // Turn a detected draft into the stored node data, uploading files first.
  const draftToData = useCallback(
    async (
      draft: NodeDraft,
      onProgress?: (percentage: number) => void,
    ): Promise<NodeData> => {
      switch (draft.kind) {
        case "link":
          return { kind: "link", url: draft.url };
        case "text":
          return { kind: "text", text: draft.text };
        case "image":
          return {
            kind: "image",
            objectKey: await uploadFile(draft.file, onProgress),
            alt: draft.alt,
          };
        case "pdf": {
          if (!("file" in draft)) {
            return { kind: "pdf", url: draft.url, name: draft.name };
          }
          const [objectKey, markdown] = await Promise.all([
            uploadFile(draft.file, onProgress),
            extractPdfMarkdown(draft.file).catch((error) => {
              console.error("pdf parse failed", error);
              return null;
            }),
          ]);
          return {
            kind: "pdf",
            objectKey,
            name: draft.name,
            ...(markdown ? { markdown } : {}),
          };
        }
      }
    },
    [uploadFile],
  );

  const processPendingDraft = useCallback(
    async (pendingId: string, draft: NodeDraft) => {
      if (processingPendingIds.current.has(pendingId)) return;
      const initialPending = useBoardStore
        .getState()
        .pendingNodes.find((node) => node.id === pendingId);
      if (!initialPending) return;

      processingPendingIds.current.add(pendingId);
      const fileBacked = isFileDraft(draft);
      useBoardStore.getState().updatePendingNode(pendingId, {
        phase: fileBacked ? "uploading" : "saving",
        progress: fileBacked ? 0 : undefined,
        error: undefined,
      });

      try {
        const data = await draftToData(draft, (percentage) => {
          useBoardStore.getState().updatePendingNode(pendingId, {
            progress: percentage,
          });
        });
        useBoardStore.getState().updatePendingNode(pendingId, {
          phase: "saving",
          progress: fileBacked ? 100 : undefined,
        });

        const beforeCreate =
          useBoardStore
            .getState()
            .pendingNodes.find((node) => node.id === pendingId) ??
          initialPending;
        // New nodes go on top of everything already on the board.
        const zIndex = frontZIndex();
        const nodeId = await createNode({
          boardId,
          type: draft.kind as NodeType,
          position: beforeCreate.position,
          data,
          style: draftStyle(draft),
          zIndex,
          realtimeSourceId: getRealtimeClientId(),
        });

        const latest = useBoardStore
          .getState()
          .pendingNodes.find((node) => node.id === pendingId);
        const finalPosition = latest?.position ?? beforeCreate.position;
        const promoted = useBoardStore
          .getState()
          .promotePendingNode(pendingId, {
            id: nodeId,
            type: draft.kind as NodeType,
            position: finalPosition,
            data: toClientNodeData(data, nodeId),
            style: draftStyle(draft),
            zIndex,
          } as BoardNode);

        if (promoted && !positionsMatch(finalPosition, beforeCreate.position)) {
          updateNode({
            nodeId,
            position: finalPosition,
            realtimeSourceId: getRealtimeClientId(),
          }).catch((error) => console.error("node move failed", error));
        }
      } catch (error) {
        const pendingStillVisible = useBoardStore
          .getState()
          .pendingNodes.some((node) => node.id === pendingId);
        if (pendingStillVisible) {
          const message = errorMessage(error);
          useBoardStore.getState().updatePendingNode(pendingId, {
            phase: "failed",
            error: message,
          });
          toast.error(message);
        }
      } finally {
        processingPendingIds.current.delete(pendingId);
      }
    },
    [boardId, draftToData],
  );

  const addDraft = useCallback(
    (draft: NodeDraft, position: XYPosition) => {
      const pendingId = `pending:${crypto.randomUUID()}`;
      const validationError = isFileDraft(draft)
        ? uploadSizeError(draft.file)
        : null;
      const node: PendingNode = {
        id: pendingId,
        type: "pending",
        position,
        data: {
          kind: "pending",
          boardId,
          preview: pendingPreview(draft),
          phase: validationError
            ? "failed"
            : isFileDraft(draft)
              ? "uploading"
              : "saving",
          progress: isFileDraft(draft) ? 0 : undefined,
          error: validationError ?? undefined,
          onRetry: validationError
            ? undefined
            : () => {
                void processPendingDraft(pendingId, draft);
              },
          onRemove: () => {
            useBoardStore.getState().removePendingNode(pendingId);
          },
        },
        style: draftStyle(draft),
        zIndex: frontZIndex(),
        selectable: false,
        deletable: false,
      };
      useBoardStore.getState().addPendingNode(node);
      if (!validationError) void processPendingDraft(pendingId, draft);
    },
    [boardId, processPendingDraft],
  );

  const moveNode = useCallback((nodeId: string, position: XYPosition) => {
    updateNode({
      nodeId,
      position,
      realtimeSourceId: getRealtimeClientId(),
    }).catch((e) => console.error("node move failed", e));
  }, []);

  const removeNode = useCallback((nodeId: string) => {
    useBoardStore.setState((s) => ({
      nodes: s.nodes.filter((n) => n.id !== nodeId),
      selectedNode: s.selectedNode?.id === nodeId ? null : s.selectedNode,
    }));
    removeNodeAction(nodeId, getRealtimeClientId()).catch((e) =>
      console.error("node remove failed", e),
    );
  }, []);

  const setNodeData = useCallback((nodeId: string, data: NodeData) => {
    updateNode({
      nodeId,
      data,
      realtimeSourceId: getRealtimeClientId(),
    }).catch((e) => console.error("node update failed", e));
  }, []);

  const resizeNode = useCallback(
    (
      nodeId: string,
      style: { width: number; height: number },
      position?: XYPosition,
    ) => {
      updateNode({
        nodeId,
        style,
        position,
        realtimeSourceId: getRealtimeClientId(),
      }).catch((e) => console.error("node resize failed", e));
    },
    [],
  );

  const duplicateNode = useCallback(
    async (node: BoardNode) => {
      try {
        const nodeId = await duplicateNodeAction({
          nodeId: node.id,
          boardId,
          position: { x: node.position.x + 24, y: node.position.y + 24 },
          style: nodeSize(node),
          realtimeSourceId: getRealtimeClientId(),
        });
        addNodeLocal({
          ...node,
          id: nodeId,
          position: { x: node.position.x + 24, y: node.position.y + 24 },
          selected: false,
        });
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : "Couldn't duplicate node",
        );
      }
    },
    [boardId],
  );

  const bringToFront = useCallback((node: BoardNode) => {
    const nextZ = frontZIndex();
    useBoardStore.setState((s) => ({
      nodes: s.nodes.map((n) =>
        n.id === node.id ? { ...n, zIndex: nextZ } : n,
      ),
    }));
    updateNode({
      nodeId: node.id,
      zIndex: nextZ,
      realtimeSourceId: getRealtimeClientId(),
    }).catch((e) => console.error("node reorder failed", e));
  }, []);

  const setImageFit = useCallback(
    (nodeId: string, fit: "cover" | "contain") => {
      useBoardStore.setState((s) => ({
        nodes: s.nodes.map((n) =>
          n.id === nodeId && n.data.kind === "image"
            ? ({ ...n, data: { ...n.data, fit } } as BoardNode)
            : n,
        ),
      }));
      patchImageNode({
        nodeId,
        fit,
        realtimeSourceId: getRealtimeClientId(),
      }).catch((e) => console.error("image fit failed", e));
    },
    [],
  );

  // Upload a cropped data URL as a new file and point the node at it.
  const replaceImage = useCallback(
    async (nodeId: string, croppedDataUrl: string) => {
      const blob = await (await fetch(croppedDataUrl)).blob();
      const file = new File([blob], "crop.png", {
        type: blob.type || "image/png",
      });
      const objectKey = await uploadFile(file);
      await patchImageNode({
        nodeId,
        objectKey,
        realtimeSourceId: getRealtimeClientId(),
      });
      useBoardStore.setState((s) => ({
        nodes: s.nodes.map((node) =>
          node.id === nodeId && node.data.kind === "image"
            ? ({
                ...node,
                data: {
                  ...node.data,
                  src: `/api/files/${nodeId}?v=${Date.now()}`,
                },
              } as BoardNode)
            : node,
        ),
      }));
    },
    [uploadFile],
  );

  return {
    addDraft,
    moveNode,
    removeNode,
    setNodeData,
    resizeNode,
    duplicateNode,
    bringToFront,
    setImageFit,
    replaceImage,
  };
}
