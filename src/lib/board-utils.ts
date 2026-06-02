import { type BoardNodeData } from "@/lib/store";

export function detectFromText(text: string): BoardNodeData | null {
  let parsed: URL;
  try {
    parsed = new URL(text.trim());
  } catch {
    return null;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
  if (parsed.pathname.toLowerCase().endsWith(".pdf")) {
    const name = decodeURIComponent(
      parsed.pathname.split("/").pop() || parsed.href,
    );
    return { kind: "pdf", src: parsed.href, name };
  }
  return { kind: "link", url: parsed.href };
}

export function detectFromFile(file: File): BoardNodeData | null {
  if (file.type.startsWith("image/")) {
    return { kind: "image", src: URL.createObjectURL(file), alt: file.name };
  }
  if (file.type === "application/pdf") {
    return { kind: "pdf", src: URL.createObjectURL(file), name: file.name };
  }
  return null;
}

export function isEditableTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  if (el.tagName === "INPUT" || el.tagName === "TEXTAREA") return true;
  return el.isContentEditable;
}
