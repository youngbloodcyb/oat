"use client";

import { code } from "@streamdown/code";
import { type ComponentProps, memo } from "react";
import { Streamdown } from "streamdown";
import { cn } from "@/lib/utils";

const streamdownPlugins = { code };

export type ChatMarkdownProps = ComponentProps<typeof Streamdown>;

const markdownComponents: ChatMarkdownProps["components"] = {
  h1: ({ className, ...props }) => (
    <h1
      className={cn("mt-6 mb-3 text-base font-medium", className)}
      {...props}
    />
  ),
  h2: ({ className, ...props }) => (
    <h2 className={cn("mt-5 mb-2 text-sm font-medium", className)} {...props} />
  ),
  h3: ({ className, ...props }) => (
    <h3 className={cn("mt-4 mb-2 text-sm font-medium", className)} {...props} />
  ),
  p: ({ className, ...props }) => (
    <p className={cn("text-sm leading-6", className)} {...props} />
  ),
  ul: ({ className, ...props }) => (
    <ul
      className={cn(
        "flex list-disc flex-col gap-1 pl-5 text-sm leading-6",
        className,
      )}
      {...props}
    />
  ),
  ol: ({ className, ...props }) => (
    <ol
      className={cn(
        "flex list-decimal flex-col gap-1 pl-5 text-sm leading-6",
        className,
      )}
      {...props}
    />
  ),
  li: ({ className, ...props }) => (
    <li className={cn("pl-0.5 text-sm leading-6", className)} {...props} />
  ),
  blockquote: ({ className, ...props }) => (
    <blockquote
      className={cn(
        "border-l-2 border-border pl-3 text-sm leading-6 text-muted-foreground",
        className,
      )}
      {...props}
    />
  ),
  hr: ({ className, ...props }) => (
    <hr className={cn("my-4 border-border/70", className)} {...props} />
  ),
  strong: ({ className, ...props }) => (
    <strong className={cn("font-medium", className)} {...props} />
  ),
  a: ({ className, ...props }) => (
    <a
      className={cn(
        "font-medium underline decoration-border underline-offset-4 transition-colors hover:decoration-foreground",
        className,
      )}
      rel="noreferrer"
      target="_blank"
      {...props}
    />
  ),
  inlineCode: ({ className, ...props }) => (
    <code
      className={cn(
        "rounded-md border border-border/70 bg-muted/40 px-1 py-0.5 font-mono text-[0.9em]",
        className,
      )}
      {...props}
    />
  ),
};

export const ChatMarkdown = memo(function ChatMarkdown({
  className,
  ...props
}: ChatMarkdownProps) {
  return (
    <Streamdown
      className={cn(
        "min-w-0 text-sm leading-6 [&>*:first-child]:mt-0 [&>*:last-child]:mb-0",
        className,
      )}
      components={markdownComponents}
      plugins={streamdownPlugins}
      {...props}
    />
  );
});
