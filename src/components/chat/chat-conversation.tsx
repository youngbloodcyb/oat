"use client";

import { ArrowDownIcon } from "@phosphor-icons/react";
import type { ComponentProps } from "react";
import { StickToBottom, useStickToBottomContext } from "use-stick-to-bottom";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function ChatConversation({
  className,
  ...props
}: ComponentProps<typeof StickToBottom>) {
  return (
    <StickToBottom
      className={cn("relative min-h-0 flex-1 overflow-y-hidden", className)}
      initial="instant"
      resize="smooth"
      role="log"
      {...props}
    />
  );
}

export function ChatConversationContent({
  className,
  ...props
}: ComponentProps<typeof StickToBottom.Content>) {
  return (
    <StickToBottom.Content
      className={cn("flex w-full flex-col gap-4 px-4 py-4", className)}
      {...props}
    />
  );
}

export function ChatScrollButton() {
  const { isAtBottom, scrollToBottom } = useStickToBottomContext();
  if (isAtBottom) return null;

  return (
    <Button
      aria-label="Scroll to latest message"
      className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full shadow-sm"
      onClick={() => scrollToBottom()}
      size="icon-sm"
      type="button"
      variant="outline"
    >
      <ArrowDownIcon />
    </Button>
  );
}
