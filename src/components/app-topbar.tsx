import type { ReactNode } from "react";
import { Separator } from "@/components/ui/separator";

/**
 * Shared chrome for the bar every page shows at its top edge. Positioned
 * `absolute`, so callers must render it inside a `relative`-positioned
 * ancestor that spans the area it should overlay.
 */
export function AppTopbar({
  left,
  center,
  right,
}: {
  left?: ReactNode;
  center?: ReactNode;
  right?: ReactNode;
}) {
  return (
    <div className="absolute inset-x-0 top-0 z-50">
      <div className="grid h-10 grid-cols-[1fr_auto_1fr] items-center gap-2 bg-card/80 px-4 backdrop-blur">
        <div className="flex items-center gap-2">{left}</div>
        <div className="flex items-center justify-center gap-2">{center}</div>
        <div className="flex items-center justify-end gap-3">{right}</div>
      </div>
      <Separator />
    </div>
  );
}
