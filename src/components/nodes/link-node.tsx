"use client";

import { GlobeIcon, PlayIcon } from "@phosphor-icons/react";
import type { NodeProps } from "@xyflow/react";
import {
  type CSSProperties,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useBoardPermissions } from "@/components/board-permissions";
import { NodeShell } from "@/components/nodes/node-shell";
import { useEditNodeData } from "@/hooks/use-edit-node-data";
import { type Embed, parseEmbed } from "@/lib/embed";
import type { LinkNode as LinkNodeType, OgMeta } from "@/lib/store";

export function LinkNode({ id, data, selected }: NodeProps<LinkNodeType>) {
  const { canEdit } = useBoardPermissions();
  const editNodeData = useEditNodeData();
  const triedRef = useRef(false);
  const [imageFailed, setImageFailed] = useState(false);

  useEffect(() => {
    if (!canEdit || data.og || triedRef.current) return;
    triedRef.current = true;

    fetch(`/api/og?url=${encodeURIComponent(data.url)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((og) => {
        if (!og) return;
        editNodeData(id, { kind: "link", url: data.url, og });
      })
      .catch(() => {});
  }, [canEdit, id, data.url, data.og, editNodeData]);

  const { host, path } = splitUrl(data.url);
  const embed = useMemo(() => parseEmbed(data.url), [data.url]);

  return (
    <NodeShell
      id={id}
      selected={selected}
      minWidth={160}
      minHeight={120}
      className={embed ? "flex flex-col" : undefined}
    >
      {embed ? (
        <EmbedPlayer
          key={embed.src}
          embed={embed}
          title={data.og?.title}
          fallbackPoster={data.og?.image}
        />
      ) : data.og?.image && !imageFailed ? (
        <img
          src={data.og.image}
          alt=""
          className="h-32 w-full object-cover"
          onError={() => setImageFailed(true)}
        />
      ) : (
        <LinkPreviewFallback host={host} path={path} og={data.og} />
      )}
      <div className="space-y-1 p-3">
        {data.og?.title && (
          <div
            className={`${embed ? "line-clamp-1" : "line-clamp-2"} text-sm font-medium`}
          >
            {data.og.title}
          </div>
        )}
        {data.og?.description && !embed && (
          <div className="line-clamp-2 text-xs text-muted-foreground">
            {data.og.description}
          </div>
        )}
        <a
          href={data.url}
          target="_blank"
          rel="noopener noreferrer"
          className="block cursor-pointer truncate text-xs text-muted-foreground hover:text-foreground"
        >
          {data.og?.siteName ?? host}
        </a>
      </div>
    </NodeShell>
  );
}

/**
 * A link that plays inline. Heavy players show a poster until play is
 * pressed, so a board full of videos stays light. Only the play button
 * starts one; the rest of the poster still selects and drags the node, and
 * the title strip below stays a handle once the player is up.
 */
function EmbedPlayer({
  embed,
  title,
  fallbackPoster,
}: {
  embed: Embed;
  title?: string;
  fallbackPoster?: string;
}) {
  const [playing, setPlaying] = useState(embed.load === "eager");
  const [posterFailed, setPosterFailed] = useState(false);
  const poster = embed.thumbnail ?? fallbackPoster;

  if (playing && embed.player === "video") {
    return (
      // biome-ignore lint/a11y/useMediaCaption: arbitrary linked videos have no captions to offer.
      <video
        src={embed.src}
        controls
        playsInline
        preload="metadata"
        className="nodrag min-h-0 w-full flex-1 bg-black object-contain"
      />
    );
  }

  if (playing) {
    return (
      <iframe
        src={embed.src}
        title={title ?? "Embedded player"}
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
        allowFullScreen
        referrerPolicy="strict-origin-when-cross-origin"
        className="nodrag nowheel min-h-0 w-full flex-1"
      />
    );
  }

  return (
    <div className="relative min-h-0 flex-1 bg-black">
      {poster && !posterFailed && (
        <img
          src={poster}
          alt=""
          className="h-full w-full object-cover"
          onError={() => setPosterFailed(true)}
        />
      )}
      <button
        type="button"
        aria-label="Play"
        onClick={() => setPlaying(true)}
        className="nodrag absolute top-1/2 left-1/2 flex size-12 -translate-x-1/2 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full bg-black/70 text-white shadow-md transition-colors hover:bg-black/90"
      >
        <PlayIcon weight="fill" className="size-5" />
      </button>
    </div>
  );
}

/**
 * Stands in for a missing preview image: the site's icon over a wash of its
 * theme color, with the domain and path so the card still says where it goes.
 */
function LinkPreviewFallback({
  host,
  path,
  og,
}: {
  host: string;
  path: string;
  og?: OgMeta;
}) {
  const [iconFailed, setIconFailed] = useState(false);
  const style: CSSProperties | undefined = og?.themeColor
    ? {
        backgroundColor: `color-mix(in oklab, ${og.themeColor} 18%, var(--muted))`,
      }
    : undefined;

  return (
    <div
      className="flex h-32 w-full flex-col items-center justify-center gap-2 bg-muted px-4 text-center"
      style={style}
    >
      {og?.icon && !iconFailed ? (
        <img
          src={og.icon}
          alt=""
          className="size-10 rounded-lg bg-background object-contain p-1 shadow-xs"
          onError={() => setIconFailed(true)}
        />
      ) : (
        <span className="flex size-10 items-center justify-center rounded-lg bg-background shadow-xs">
          <GlobeIcon className="size-5 text-muted-foreground" />
        </span>
      )}
      <div className="w-full min-w-0">
        <div className="truncate text-xs font-medium">{host}</div>
        {path && (
          <div className="truncate text-[11px] text-muted-foreground">
            {path}
          </div>
        )}
      </div>
    </div>
  );
}

function splitUrl(url: string): { host: string; path: string } {
  try {
    const parsed = new URL(url);
    const path = `${parsed.pathname}${parsed.search}`.replace(/\/$/, "");
    return { host: parsed.hostname.replace(/^www\./, ""), path };
  } catch {
    return { host: url, path: "" };
  }
}
