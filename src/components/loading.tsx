import { SpinnerIcon } from "@phosphor-icons/react/dist/ssr";

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
        "flex min-h-screen flex-col items-center justify-center gap-2 text-muted-foreground",
        className,
      )}
      {...props}
    >
      <SpinnerIcon className="size-5 animate-spin" />
      <span className="text-sm">{label}</span>
    </div>
  );
}
