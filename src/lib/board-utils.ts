// A pending node detected from paste/drop input, before it's persisted.
// File-backed drafts carry the raw File so the action layer can upload its
// bytes to Convex storage; URL-backed drafts are stored as-is.
export type NodeDraft =
  | { kind: "link"; url: string }
  | { kind: "text"; text: string }
  | { kind: "image"; file: File; alt: string }
  | { kind: "pdf"; file: File; name: string }
  | { kind: "pdf"; url: string; name: string };

// Text always produces a draft: an http(s) URL becomes a link/pdf, anything
// else becomes a plain text node.
export function detectFromText(text: string): NodeDraft {
  let parsed: URL | null = null;
  try {
    parsed = new URL(text.trim());
  } catch {}

  if (parsed && (parsed.protocol === "http:" || parsed.protocol === "https:")) {
    if (parsed.pathname.toLowerCase().endsWith(".pdf")) {
      const name = decodeURIComponent(
        parsed.pathname.split("/").pop() || parsed.href,
      );
      return { kind: "pdf", url: parsed.href, name };
    }
    return { kind: "link", url: parsed.href };
  }

  return { kind: "text", text };
}

export function detectFromFile(file: File): NodeDraft | null {
  if (file.type.startsWith("image/")) {
    return { kind: "image", file, alt: file.name };
  }
  if (file.type === "application/pdf") {
    return { kind: "pdf", file, name: file.name };
  }
  return null;
}

export function isEditableTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  if (el.tagName === "INPUT" || el.tagName === "TEXTAREA") return true;
  return el.isContentEditable;
}
