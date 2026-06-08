"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  ImageCrop,
  ImageCropApply,
  ImageCropContent,
  ImageCropReset,
} from "@/components/kibo-ui/image-crop";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useBoardActions } from "@/hooks/use-board-actions";
import { useBoardStore } from "@/lib/store";
import { cn } from "@/lib/utils";
import type { Id } from "~/_generated/dataModel";

const FIT_OPTIONS = [
  { value: "cover", label: "Fill" },
  { value: "contain", label: "Fit" },
] as const;

export function ImageCropDialog({ boardId }: { boardId: Id<"boards"> }) {
  const croppingId = useBoardStore((s) => s.croppingImageNodeId);
  const closeImageCrop = useBoardStore((s) => s.closeImageCrop);
  const nodes = useBoardStore((s) => s.nodes);
  const { setImageFit, replaceImage } = useBoardActions(boardId);

  const node = croppingId ? nodes.find((n) => n.id === croppingId) : null;
  const data = node?.data.kind === "image" ? node.data : null;
  const open = !!data;
  const src = data?.src ?? "";
  const fit = data?.fit ?? "cover";

  const [file, setFile] = useState<File | null>(null);
  const [applying, setApplying] = useState(false);

  // Turn the stored image URL back into a File for the cropper.
  useEffect(() => {
    if (!open || !src) {
      setFile(null);
      return;
    }
    let cancelled = false;
    fetch(src)
      .then((r) => r.blob())
      .then((blob) => {
        if (!cancelled) {
          setFile(new File([blob], "image", { type: blob.type || "image/*" }));
        }
      })
      .catch(() => toast.error("Couldn't load image to crop"));
    return () => {
      cancelled = true;
    };
  }, [open, src]);

  const onOpenChange = (next: boolean) => {
    if (!next) closeImageCrop();
  };

  const handleCrop = async (croppedDataUrl: string) => {
    if (!croppingId) return;
    setApplying(true);
    try {
      await replaceImage(croppingId, croppedDataUrl);
      closeImageCrop();
    } catch {
      toast.error("Couldn't apply crop");
    } finally {
      setApplying(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Crop image</DialogTitle>
        </DialogHeader>

        {file ? (
          <ImageCrop key={croppingId} file={file} onCrop={handleCrop}>
            <div className="flex justify-center">
              <ImageCropContent />
            </div>

            <div className="flex items-center justify-between gap-2">
              {/* Overlay (object-fit) options */}
              <div className="flex items-center gap-1 rounded-md border p-0.5">
                {FIT_OPTIONS.map((opt) => (
                  <Button
                    key={opt.value}
                    type="button"
                    size="sm"
                    variant={fit === opt.value ? "secondary" : "ghost"}
                    onClick={() =>
                      croppingId && setImageFit(croppingId, opt.value)
                    }
                  >
                    {opt.label}
                  </Button>
                ))}
              </div>

              <div className="flex items-center gap-2">
                <ImageCropReset asChild>
                  <Button type="button" variant="ghost" size="sm">
                    Reset
                  </Button>
                </ImageCropReset>
                <ImageCropApply asChild>
                  <Button type="button" size="sm" disabled={applying}>
                    {applying ? "Applying…" : "Apply crop"}
                  </Button>
                </ImageCropApply>
              </div>
            </div>
          </ImageCrop>
        ) : (
          <div className="flex h-48 items-center justify-center text-sm text-muted-foreground">
            Loading image…
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
