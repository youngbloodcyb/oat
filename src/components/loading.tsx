import { blue } from "@radix-ui/colors";
import { Blocks } from "loading-dev";

import { cn } from "@/lib/utils";

export function Loading({
  label = "",
  className,
  ...props
}: React.ComponentProps<"div"> & { label?: string }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "flex min-h-screen w-full flex-col items-center justify-center gap-2 text-muted-foreground",
        className,
      )}
      {...props}
    >
      <Blocks color={blue.blue12} size={24} className="opacity-75" />
      <span className="text-sm">{label}</span>
    </div>
  );
}
