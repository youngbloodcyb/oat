"use client";

import { use, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useShallow } from "zustand/react/shallow";
import { Skeleton } from "@/components/ui/skeleton";
import { useFocusNode } from "@/hooks/use-focus-node";
import type { PaletteColor, PaletteRole } from "@/lib/palette";
import { type ImageNode, useBoardStore } from "@/lib/store";
import { type ImagePalette, listBoardPalettes } from "@/services/palettes";

// Palettes are computed in the background after an upload, so poll while
// any image on the board is still waiting for one, for up to two minutes.
const POLL_MS = 4_000;
const MAX_POLLS = 30;

// Backgrounds and discarded colors aren't part of the brand palette.
const SHOWN_ROLES: PaletteRole[] = ["primary", "accent", "neutral"];

function shownColors(colors: PaletteColor[]): PaletteColor[] {
  return colors
    .filter((c) => SHOWN_ROLES.includes(c.role))
    .sort(
      (x, y) =>
        SHOWN_ROLES.indexOf(x.role) - SHOWN_ROLES.indexOf(y.role) ||
        y.salience - x.salience,
    );
}

// The likeliest color of each role leads; the rest sit behind "show more".
function splitLeadColors(colors: PaletteColor[]): {
  lead: PaletteColor[];
  more: PaletteColor[];
} {
  const lead = SHOWN_ROLES.flatMap((role) => {
    const first = colors.find((c) => c.role === role);
    return first ? [first] : [];
  });
  return { lead, more: colors.filter((c) => !lead.includes(c)) };
}

function byNode(rows: ImagePalette[]): Map<string, ImagePalette> {
  return new Map(rows.map((row) => [row.nodeId, row]));
}

/**
 * The extracted colors of each image on the board. Starts from the palettes
 * loaded with the page, and only fetches for images that don't have one yet.
 */
export function BoardPalette({
  boardId,
  initialPalettes,
}: {
  boardId: string;
  initialPalettes: Promise<ImagePalette[]>;
}) {
  const images = useBoardStore(
    useShallow((s) =>
      s.nodes.filter((n): n is ImageNode => n.data.kind === "image"),
    ),
  );
  const initial = use(initialPalettes);
  const [palettes, setPalettes] = useState(() => byNode(initial));
  // Read by the effect to decide whether to fetch, without refetching on
  // every update it makes itself.
  const palettesRef = useRef(palettes);
  const [stalled, setStalled] = useState(false);
  const focusNode = useFocusNode();
  const imageIds = images.map((i) => i.id).join(",");

  useEffect(() => {
    const ids = imageIds ? imageIds.split(",") : [];
    const missing = (map: Map<string, ImagePalette>) =>
      ids.some((id) => !map.has(id));
    if (!missing(palettesRef.current)) return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let polls = 0;
    setStalled(false);

    const load = async () => {
      try {
        const next = byNode(await listBoardPalettes(boardId));
        if (cancelled) return;
        palettesRef.current = next;
        setPalettes(next);
        if (!missing(next)) return;
        polls += 1;
        if (polls < MAX_POLLS) timer = setTimeout(load, POLL_MS);
        else setStalled(true);
      } catch {
        if (!cancelled) toast.error("Couldn't load the board's colors");
      }
    };
    void load();

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [boardId, imageIds]);

  if (images.length === 0) {
    return (
      <p className="p-4 text-sm text-muted-foreground">
        Add images to the board to see their colors.
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-1 overflow-y-auto p-2">
      {images.map((image) => {
        const palette = palettes.get(image.id);
        const colors = palette ? shownColors(palette.colors) : [];
        return (
          <li
            key={image.id}
            className="flex items-start gap-3 rounded-md p-2 hover:bg-muted/50"
          >
            <button
              type="button"
              onClick={() => focusNode(image.id)}
              className="size-12 shrink-0 overflow-hidden rounded-md border bg-muted"
              aria-label={`Show ${image.data.alt || "image"} on the board`}
            >
              {/* biome-ignore lint/performance/noImgElement: blob/API-route URLs cannot use the Next image optimizer */}
              <img
                src={image.data.src}
                alt=""
                className="h-full w-full object-cover"
                draggable={false}
              />
            </button>
            {!palette ? (
              stalled ? (
                <p className="self-center text-xs text-muted-foreground">
                  Colors aren&rsquo;t available yet.
                </p>
              ) : (
                <div className="flex gap-2 self-center">
                  <span className="sr-only">Extracting colors</span>
                  {[0, 1, 2, 3].map((i) => (
                    <Skeleton key={i} className="size-9 rounded-md" />
                  ))}
                </div>
              )
            ) : colors.length === 0 ? (
              <p className="self-center text-xs text-muted-foreground">
                No brand colors found.
              </p>
            ) : (
              <ImageColors colors={colors} />
            )}
          </li>
        );
      })}
    </ul>
  );
}

function ImageColors({ colors }: { colors: PaletteColor[] }) {
  const [expanded, setExpanded] = useState(false);
  const { lead, more } = splitLeadColors(colors);
  const shown = expanded ? [...lead, ...more] : lead;

  return (
    <div className="flex min-w-0 flex-wrap gap-2">
      {shown.map((color) => (
        <Swatch key={color.hex} color={color} />
      ))}
      {more.length > 0 && (
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          aria-expanded={expanded}
          aria-label={
            expanded ? "Show fewer colors" : `Show ${more.length} more colors`
          }
          className="flex flex-col items-center gap-1"
        >
          <span className="flex size-9 items-center justify-center rounded-md border border-dashed text-xs text-muted-foreground transition-colors hover:bg-muted">
            {expanded ? "−" : `+${more.length}`}
          </span>
          <span className="text-[0.625rem] text-muted-foreground">
            {expanded ? "less" : "more"}
          </span>
        </button>
      )}
    </div>
  );
}

function Swatch({ color }: { color: PaletteColor }) {
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(color.hex);
      toast.success(`Copied ${color.hex}`);
    } catch {
      toast.error("Couldn't copy the color");
    }
  };

  return (
    <button
      type="button"
      onClick={copy}
      title={`${color.hex} · ${color.role}`}
      className="flex flex-col items-center gap-1"
    >
      <span
        className="size-9 rounded-md border shadow-xs"
        style={{ backgroundColor: color.hex }}
      />
      <span className="font-mono text-[0.625rem] text-muted-foreground uppercase">
        {color.hex.slice(1)}
      </span>
    </button>
  );
}
