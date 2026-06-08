import type { Icon } from "@phosphor-icons/react";
import {
  ArrowsClockwiseIcon,
  ArrowSquareOutIcon,
  CopyIcon,
  CropIcon,
  DownloadSimpleIcon,
  EraserIcon,
  LinkIcon,
  PencilSimpleIcon,
  StackIcon,
  TrashIcon,
} from "@phosphor-icons/react";
import { toast } from "sonner";
import type { BoardNode, EditableNodeData } from "@/lib/store";

// Capabilities an action needs, supplied by the dock (which owns the hooks).
export type ActionCtx = {
  node: BoardNode;
  remove: (id: string) => void;
  duplicate: (node: BoardNode) => void;
  bringToFront: (node: BoardNode) => void;
  editData: (id: string, data: EditableNodeData) => void;
  openTextEditor: (id: string) => void;
  openImageCrop: (id: string) => void;
};

export type NodeAction = {
  name: string;
  icon: Icon;
  danger?: boolean;
  run: (ctx: ActionCtx) => void | Promise<void>;
};

function openInNewTab(url: string) {
  window.open(url, "_blank", "noopener,noreferrer");
}

function download(url: string, filename: string) {
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.target = "_blank";
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
}

// --- Common: available on every node ---------------------------------------

const duplicate: NodeAction = {
  name: "Duplicate",
  icon: CopyIcon,
  run: (c) => c.duplicate(c.node),
};

const bringToFront: NodeAction = {
  name: "Bring to front",
  icon: StackIcon,
  run: (c) => c.bringToFront(c.node),
};

const remove: NodeAction = {
  name: "Delete",
  icon: TrashIcon,
  danger: true,
  run: (c) => {
    c.remove(c.node.id);
    toast.success("Node deleted");
  },
};

const commonActions: NodeAction[] = [duplicate, bringToFront, remove];

// --- Link ------------------------------------------------------------------

const openLink: NodeAction = {
  name: "Open link",
  icon: ArrowSquareOutIcon,
  run: (c) => {
    if (c.node.data.kind === "link") openInNewTab(c.node.data.url);
  },
};

const copyUrl: NodeAction = {
  name: "Copy URL",
  icon: LinkIcon,
  run: async (c) => {
    if (c.node.data.kind !== "link") return;
    try {
      await navigator.clipboard.writeText(c.node.data.url);
      toast.success("Link copied");
    } catch {
      toast.error("Couldn't copy link");
    }
  },
};

const refreshPreview: NodeAction = {
  name: "Refresh preview",
  icon: ArrowsClockwiseIcon,
  run: async (c) => {
    if (c.node.data.kind !== "link") return;
    const url = c.node.data.url;
    try {
      const res = await fetch(`/api/og?url=${encodeURIComponent(url)}`);
      const og = res.ok ? await res.json() : null;
      if (!og) {
        toast.error("No preview found");
        return;
      }
      c.editData(c.node.id, { kind: "link", url, og });
      toast.success("Preview refreshed");
    } catch {
      toast.error("Couldn't refresh preview");
    }
  },
};

// --- Text ------------------------------------------------------------------

const editText: NodeAction = {
  name: "Edit text",
  icon: PencilSimpleIcon,
  run: (c) => c.openTextEditor(c.node.id),
};

const clearText: NodeAction = {
  name: "Clear text",
  icon: EraserIcon,
  run: (c) => {
    if (c.node.data.kind === "text") c.editData(c.node.id, { kind: "text", text: "" });
  },
};

// --- Image / PDF -----------------------------------------------------------

const cropImage: NodeAction = {
  name: "Crop image",
  icon: CropIcon,
  run: (c) => c.openImageCrop(c.node.id),
};

const openImage: NodeAction = {
  name: "Open image",
  icon: ArrowSquareOutIcon,
  run: (c) => {
    if (c.node.data.kind === "image") openInNewTab(c.node.data.src);
  },
};

const downloadImage: NodeAction = {
  name: "Download",
  icon: DownloadSimpleIcon,
  run: (c) => {
    if (c.node.data.kind === "image")
      download(c.node.data.src, c.node.data.alt ?? "image");
  },
};

const openPdf: NodeAction = {
  name: "Open PDF",
  icon: ArrowSquareOutIcon,
  run: (c) => {
    if (c.node.data.kind === "pdf") openInNewTab(c.node.data.src);
  },
};

const downloadPdf: NodeAction = {
  name: "Download",
  icon: DownloadSimpleIcon,
  run: (c) => {
    if (c.node.data.kind === "pdf") download(c.node.data.src, c.node.data.name);
  },
};

// --- Registry --------------------------------------------------------------

const actionsByKind: Partial<Record<BoardNode["type"], NodeAction[]>> = {
  link: [openLink, copyUrl, refreshPreview],
  text: [editText, clearText],
  image: [cropImage, openImage, downloadImage],
  pdf: [openPdf, downloadPdf],
};

/** Actions for a node: its kind-specific ones first, then the common set. */
export function actionsFor(node: BoardNode): NodeAction[] {
  return [...(actionsByKind[node.type] ?? []), ...commonActions];
}
