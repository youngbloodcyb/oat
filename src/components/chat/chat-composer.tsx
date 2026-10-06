"use client";

import { ArrowUpIcon, StopIcon } from "@phosphor-icons/react";
import {
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
  useEffect,
  useId,
  useRef,
} from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const MAX_CHAT_MESSAGE_CHARS = 8_000;

export function ChatComposer({
  className,
  context,
  disabled = false,
  isBusy = false,
  onChange,
  onStop,
  onSubmit,
  placeholder = "Ask about this board…",
  value,
}: {
  className?: string;
  /** Shown above the text box, for what will be sent along with the message. */
  context?: ReactNode;
  disabled?: boolean;
  isBusy?: boolean;
  onChange: (value: string) => void;
  onStop: () => void;
  onSubmit: (value: string) => void;
  placeholder?: string;
  value: string;
}) {
  const composerId = useId();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const trimmed = value.trim();
  const canSubmit = !disabled && !isBusy && trimmed.length > 0;

  useEffect(() => {
    if (disabled) return;
    const frame = requestAnimationFrame(() =>
      textareaRef.current?.focus({ preventScroll: true }),
    );
    return () => cancelAnimationFrame(frame);
  }, [disabled]);

  const submit = () => {
    if (canSubmit) onSubmit(trimmed);
  };

  return (
    <form
      className={cn(
        "rounded-xl border border-border bg-card shadow-xs transition-colors focus-within:border-ring/60",
        className,
      )}
      onSubmit={(event: FormEvent) => {
        event.preventDefault();
        submit();
      }}
    >
      {context}
      <label className="sr-only" htmlFor={composerId}>
        Message the assistant
      </label>
      <textarea
        className="field-sizing-content max-h-40 min-h-14 w-full resize-none bg-transparent px-3 pt-2.5 pb-1 text-sm leading-6 outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-60"
        disabled={disabled}
        id={composerId}
        maxLength={MAX_CHAT_MESSAGE_CHARS}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event: KeyboardEvent<HTMLTextAreaElement>) => {
          if (
            event.key === "Enter" &&
            !event.shiftKey &&
            !event.nativeEvent.isComposing
          ) {
            event.preventDefault();
            submit();
          }
        }}
        placeholder={placeholder}
        ref={textareaRef}
        rows={2}
        value={value}
      />
      <div className="flex justify-end px-2 pb-2">
        {isBusy ? (
          <Button
            aria-label="Stop response"
            onClick={onStop}
            size="icon-sm"
            type="button"
            variant="secondary"
          >
            <StopIcon weight="fill" />
          </Button>
        ) : (
          <Button
            aria-label="Send message"
            disabled={!canSubmit}
            size="icon-sm"
            type="submit"
          >
            <ArrowUpIcon weight="bold" />
          </Button>
        )}
      </div>
    </form>
  );
}
