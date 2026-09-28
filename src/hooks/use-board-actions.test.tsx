import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  upload: vi.fn(),
  createNode: vi.fn(),
  updateNode: vi.fn(),
  patchImageNode: vi.fn(),
  extractPdfMarkdown: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock("@vercel/blob/client", () => ({ upload: mocks.upload }));
vi.mock("@/lib/auth-client", () => ({
  authClient: {
    useSession: () => ({ data: { user: { id: "user-a" } } }),
  },
}));
vi.mock("@/lib/blob", () => ({
  objectKeyFor: () => "user-a/board-a/upload",
}));
vi.mock("@/lib/pdf-parser", () => ({
  extractPdfMarkdown: mocks.extractPdfMarkdown,
}));
vi.mock("sonner", () => ({ toast: { error: mocks.toastError } }));
vi.mock("@/services/nodes", () => ({
  createNode: mocks.createNode,
  duplicateNode: vi.fn(),
  patchImageNode: mocks.patchImageNode,
  removeNode: vi.fn(),
  updateNode: mocks.updateNode,
}));

import { useBoardActions } from "@/hooks/use-board-actions";
import { useBoardStore } from "@/lib/store";
import { MAX_UPLOAD_SIZE_BYTES } from "@/lib/upload-policy";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

beforeEach(() => {
  vi.clearAllMocks();
  useBoardStore.setState({
    nodes: [],
    pendingNodes: [],
    nodesBoardId: "board-a",
    selectedNode: null,
    editingTextNodeId: null,
    croppingImageNodeId: null,
  });
  mocks.extractPdfMarkdown.mockResolvedValue(null);
});

describe("addDraft optimistic nodes", () => {
  it("shows text immediately and promotes it after creation", async () => {
    const creation = deferred<string>();
    mocks.createNode.mockReturnValue(creation.promise);
    const { result } = renderHook(() => useBoardActions("board-a"));

    act(() => {
      result.current.addDraft(
        { kind: "text", text: "hello" },
        { x: 12, y: 34 },
      );
    });

    const pending = useBoardStore.getState().pendingNodes[0];
    expect(pending?.data.preview).toEqual({ kind: "text", text: "hello" });
    expect(pending?.data.phase).toBe("saving");
    expect(useBoardStore.getState().nodes).toEqual([]);

    await waitFor(() => expect(mocks.createNode).toHaveBeenCalledOnce());
    act(() => creation.resolve("node-real"));

    await waitFor(() => {
      expect(useBoardStore.getState().pendingNodes).toEqual([]);
      expect(useBoardStore.getState().nodes[0]?.id).toBe("node-real");
    });
  });

  it("uses a blob preview and reports file upload progress", async () => {
    const upload = deferred<{ pathname: string }>();
    mocks.upload.mockReturnValue(upload.promise);
    mocks.createNode.mockResolvedValue("image-real");
    const createObjectURL = vi
      .spyOn(URL, "createObjectURL")
      .mockReturnValue("blob:image-preview");
    const revokeObjectURL = vi
      .spyOn(URL, "revokeObjectURL")
      .mockImplementation(() => {});
    const { result } = renderHook(() => useBoardActions("board-a"));
    const file = new File(["image"], "photo.png", { type: "image/png" });

    act(() => {
      result.current.addDraft(
        { kind: "image", file, alt: file.name },
        { x: 0, y: 0 },
      );
    });

    expect(useBoardStore.getState().pendingNodes[0]?.data.preview).toEqual({
      kind: "image",
      src: "blob:image-preview",
      alt: "photo.png",
    });
    await waitFor(() => expect(mocks.upload).toHaveBeenCalledOnce());

    const options = mocks.upload.mock.calls[0]?.[2] as {
      onUploadProgress: (event: { percentage: number }) => void;
    };
    act(() => options.onUploadProgress({ percentage: 37 }));
    expect(useBoardStore.getState().pendingNodes[0]?.data.progress).toBe(37);

    act(() => upload.resolve({ pathname: "user-a/board-a/photo.png" }));
    await waitFor(() => {
      expect(useBoardStore.getState().nodes[0]?.id).toBe("image-real");
    });
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:image-preview");

    createObjectURL.mockRestore();
    revokeObjectURL.mockRestore();
  });

  it("rejects oversized files immediately without starting an upload", () => {
    const createObjectURL = vi
      .spyOn(URL, "createObjectURL")
      .mockReturnValue("blob:large-preview");
    const { result } = renderHook(() => useBoardActions("board-a"));
    const file = new File([], "large.png", { type: "image/png" });
    Object.defineProperty(file, "size", {
      value: MAX_UPLOAD_SIZE_BYTES + 1,
    });

    act(() => {
      result.current.addDraft(
        { kind: "image", file, alt: file.name },
        { x: 0, y: 0 },
      );
    });

    const pending = useBoardStore.getState().pendingNodes[0];
    expect(pending?.data.phase).toBe("failed");
    expect(pending?.data.error).toBe(
      "large.png is too large. The maximum upload size is 10 MB.",
    );
    expect(pending?.data.onRetry).toBeUndefined();
    expect(mocks.upload).not.toHaveBeenCalled();
    expect(mocks.extractPdfMarkdown).not.toHaveBeenCalled();
    expect(mocks.createNode).not.toHaveBeenCalled();
    createObjectURL.mockRestore();
  });

  it("keeps failures visible and retries them in place", async () => {
    mocks.createNode.mockRejectedValueOnce(new Error("Database unavailable"));
    const { result } = renderHook(() => useBoardActions("board-a"));

    act(() => {
      result.current.addDraft(
        { kind: "link", url: "https://example.com" },
        { x: 5, y: 6 },
      );
    });

    await waitFor(() => {
      const pending = useBoardStore.getState().pendingNodes[0];
      expect(pending?.data.phase).toBe("failed");
      expect(pending?.data.error).toBe("Database unavailable");
    });

    mocks.createNode.mockResolvedValueOnce("link-real");
    act(() => {
      useBoardStore.getState().pendingNodes[0]?.data.onRetry?.();
    });

    await waitFor(() => {
      expect(useBoardStore.getState().pendingNodes).toEqual([]);
      expect(useBoardStore.getState().nodes[0]?.id).toBe("link-real");
    });
  });

  it("stores extracted markdown for an uploaded PDF", async () => {
    mocks.upload.mockResolvedValue({ pathname: "user-a/board-a/report.pdf" });
    mocks.extractPdfMarkdown.mockResolvedValue("# Quarterly report");
    mocks.createNode.mockResolvedValue("pdf-real");
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:pdf-preview");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    const file = new File(["pdf"], "report.pdf", {
      type: "application/pdf",
    });
    const { result } = renderHook(() => useBoardActions("board-a"));

    act(() => {
      result.current.addDraft(
        { kind: "pdf", file, name: file.name },
        { x: 0, y: 0 },
      );
    });

    await waitFor(() => expect(mocks.createNode).toHaveBeenCalledOnce());
    expect(mocks.extractPdfMarkdown).toHaveBeenCalledWith(file);
    expect(mocks.createNode).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          kind: "pdf",
          objectKey: "user-a/board-a/report.pdf",
          name: "report.pdf",
          markdown: "# Quarterly report",
        },
      }),
    );
    expect(useBoardStore.getState().nodes[0]?.data).toEqual({
      kind: "pdf",
      src: "/api/files/pdf-real",
      name: "report.pdf",
    });
    vi.restoreAllMocks();
  });

  it("keeps an uploaded PDF when parsing fails", async () => {
    mocks.upload.mockResolvedValue({ pathname: "user-a/board-a/report.pdf" });
    mocks.extractPdfMarkdown.mockRejectedValue(new Error("Encrypted PDF"));
    mocks.createNode.mockResolvedValue("pdf-real");
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:pdf-preview");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    const file = new File(["pdf"], "report.pdf", {
      type: "application/pdf",
    });
    const { result } = renderHook(() => useBoardActions("board-a"));

    act(() => {
      result.current.addDraft(
        { kind: "pdf", file, name: file.name },
        { x: 0, y: 0 },
      );
    });

    await waitFor(() => expect(mocks.createNode).toHaveBeenCalledOnce());
    expect(mocks.createNode).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          kind: "pdf",
          objectKey: "user-a/board-a/report.pdf",
          name: "report.pdf",
        },
      }),
    );
    expect(consoleError).toHaveBeenCalledWith(
      "pdf parse failed",
      expect.any(Error),
    );
    expect(mocks.toastError).not.toHaveBeenCalled();
    vi.restoreAllMocks();
  });

  it("does not parse URL-backed PDFs", async () => {
    mocks.createNode.mockResolvedValue("pdf-url");
    const { result } = renderHook(() => useBoardActions("board-a"));

    act(() => {
      result.current.addDraft(
        {
          kind: "pdf",
          url: "https://example.com/report.pdf",
          name: "report.pdf",
        },
        { x: 0, y: 0 },
      );
    });

    await waitFor(() => expect(mocks.createNode).toHaveBeenCalledOnce());
    expect(mocks.extractPdfMarkdown).not.toHaveBeenCalled();
    expect(mocks.createNode).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          kind: "pdf",
          url: "https://example.com/report.pdf",
          name: "report.pdf",
        },
      }),
    );
  });
});

describe("replaceImage", () => {
  it("persists the replacement and refreshes the rendered image URL", async () => {
    vi.spyOn(Date, "now").mockReturnValue(1234);
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      blob: async () => new Blob(["cropped"], { type: "image/png" }),
    } as Response);
    mocks.upload.mockResolvedValue({
      pathname: "user-a/board-a/crop.png",
    });
    useBoardStore.setState({
      nodes: [
        {
          id: "image-1",
          type: "image",
          position: { x: 0, y: 0 },
          data: {
            kind: "image",
            src: "/api/files/image-1",
            alt: "Photo",
          },
        },
      ],
    });
    const { result } = renderHook(() => useBoardActions("board-a"));

    await act(() =>
      result.current.replaceImage("image-1", "data:image/png;base64,crop"),
    );

    expect(mocks.patchImageNode).toHaveBeenCalledWith(
      expect.objectContaining({
        nodeId: "image-1",
        objectKey: "user-a/board-a/crop.png",
        realtimeSourceId: expect.any(String),
      }),
    );
    expect(useBoardStore.getState().nodes[0]?.data).toEqual({
      kind: "image",
      src: "/api/files/image-1?v=1234",
      alt: "Photo",
    });
  });
});
