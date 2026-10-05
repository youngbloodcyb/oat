import { BoardPreviewImage } from "@/components/board-preview-image";
import {
  type BoardPreviewNode,
  previewViewBox,
  TEXT_LAYOUT,
  textLines,
} from "@/lib/board-preview";

// Sizes in board pixels, matching the canvas nodes: `rounded-lg` cards and
// the link node's `h-32` preview image.
const RADIUS = 8;
const LINK_IMAGE_HEIGHT = 128;
const PDF_HEADER_HEIGHT = 33;
const BAR_HEIGHT = 8;

const barClassName = "fill-muted-foreground/25";

/**
 * A miniature of a board, drawn from its stored nodes. Text is too small to
 * read at this scale, so it's drawn as bars where the lines would be.
 */
export function BoardPreview({ nodes }: { nodes: BoardPreviewNode[] }) {
  const view = previewViewBox(nodes);
  if (!view) return null;
  return (
    <svg
      viewBox={`${view.x} ${view.y} ${view.width} ${view.height}`}
      preserveAspectRatio="xMidYMid meet"
      className="size-full"
      aria-hidden="true"
    >
      {nodes.map((node) => (
        <PreviewNode key={node.id} node={node} />
      ))}
    </svg>
  );
}

function PreviewNode({ node }: { node: BoardPreviewNode }) {
  const { width, height } = node;
  // Node ids are unique across boards, so this is unique on the page.
  const clipId = `board-preview-${node.id}`;
  return (
    <g transform={`translate(${node.x} ${node.y})`}>
      <clipPath id={clipId}>
        <rect width={width} height={height} rx={RADIUS} />
      </clipPath>
      <g clipPath={`url(#${clipId})`}>
        <rect width={width} height={height} className="fill-card" />
        <NodeContent node={node} />
      </g>
      <rect
        width={width}
        height={height}
        rx={RADIUS}
        fill="none"
        strokeWidth={1}
        vectorEffect="non-scaling-stroke"
        className="stroke-border"
      />
    </g>
  );
}

function NodeContent({ node }: { node: BoardPreviewNode }) {
  const { width, height, data } = node;
  switch (data.kind) {
    case "image":
      return (
        <>
          <rect width={width} height={height} className="fill-muted" />
          {data.src && (
            <BoardPreviewImage
              href={data.src}
              width={width}
              height={height}
              preserveAspectRatio={
                data.fit === "contain" ? "xMidYMid meet" : "xMidYMid slice"
              }
            />
          )}
        </>
      );
    case "text":
      return textLines(data.paragraphs, width, height).map((line) => (
        <Bar
          key={line.y}
          x={TEXT_LAYOUT.padding}
          y={line.y + (TEXT_LAYOUT.lineHeight - BAR_HEIGHT) / 2}
          width={line.width}
        />
      ));
    case "link":
      return <LinkContent width={width} data={data} />;
    case "pdf":
      return <PdfContent width={width} height={height} />;
  }
}

function LinkContent({
  width,
  data,
}: {
  width: number;
  data: Extract<BoardPreviewNode["data"], { kind: "link" }>;
}) {
  const inner = width - 24;
  // Title (text-sm), description (text-xs), then the site name, under p-3.
  const bars: { y: number; width: number }[] = [];
  let y = LINK_IMAGE_HEIGHT + 12;
  if (data.hasTitle) {
    bars.push({ y: y + 6, width: inner * 0.8 });
    y += 24;
  }
  if (data.hasDescription) {
    bars.push({ y: y + 4, width: inner }, { y: y + 20, width: inner * 0.6 });
    y += 36;
  }
  bars.push({ y: y + 4, width: inner * 0.35 });

  return (
    <>
      {data.image ? (
        <>
          <rect
            width={width}
            height={LINK_IMAGE_HEIGHT}
            className="fill-muted"
          />
          <BoardPreviewImage
            href={data.image}
            width={width}
            height={LINK_IMAGE_HEIGHT}
            preserveAspectRatio="xMidYMid slice"
          />
        </>
      ) : (
        <LinkFallback width={width} data={data} />
      )}
      {bars.map((bar) => (
        <Bar key={bar.y} x={12} y={bar.y} width={bar.width} />
      ))}
    </>
  );
}

/** The site icon over a wash of its theme color, as on the canvas. */
function LinkFallback({
  width,
  data,
}: {
  width: number;
  data: Extract<BoardPreviewNode["data"], { kind: "link" }>;
}) {
  const iconX = (width - 40) / 2;
  return (
    <>
      <rect
        width={width}
        height={LINK_IMAGE_HEIGHT}
        className="fill-muted"
        style={
          data.themeColor
            ? {
                fill: `color-mix(in oklab, ${data.themeColor} 18%, var(--muted))`,
              }
            : undefined
        }
      />
      <rect
        x={iconX}
        y={28}
        width={40}
        height={40}
        rx={8}
        className="fill-background"
      />
      {data.icon && (
        <BoardPreviewImage
          href={data.icon}
          x={iconX + 4}
          y={32}
          width={32}
          height={32}
          preserveAspectRatio="xMidYMid meet"
        />
      )}
      <Bar x={width * 0.3} y={80} width={width * 0.4} />
    </>
  );
}

/** The file name header over a page, standing in for the embedded viewer. */
function PdfContent({ width, height }: { width: number; height: number }) {
  const pageWidth = width - 48;
  const pageTop = PDF_HEADER_HEIGHT + 24;
  return (
    <>
      <rect width={width} height={height} className="fill-muted" />
      <Bar
        x={12}
        y={(PDF_HEADER_HEIGHT - BAR_HEIGHT) / 2}
        width={width * 0.5}
      />
      <line
        x1={0}
        x2={width}
        y1={PDF_HEADER_HEIGHT}
        y2={PDF_HEADER_HEIGHT}
        strokeWidth={1}
        vectorEffect="non-scaling-stroke"
        className="stroke-border"
      />
      <rect
        x={24}
        y={pageTop}
        width={pageWidth}
        height={pageWidth * (11 / 8.5)}
        className="fill-white"
      />
      {[0.7, 1, 1, 0.9, 1, 0.5].map((fraction, i) => (
        <rect
          // biome-ignore lint/suspicious/noArrayIndexKey: static placeholder lines
          key={i}
          x={48}
          y={pageTop + 28 + i * 20}
          width={(pageWidth - 48) * fraction}
          height={BAR_HEIGHT}
          rx={BAR_HEIGHT / 2}
          className="fill-neutral-300"
        />
      ))}
    </>
  );
}

function Bar({ x, y, width }: { x: number; y: number; width: number }) {
  return (
    <rect
      x={x}
      y={y}
      width={Math.max(width, BAR_HEIGHT)}
      height={BAR_HEIGHT}
      rx={BAR_HEIGHT / 2}
      className={barClassName}
    />
  );
}
