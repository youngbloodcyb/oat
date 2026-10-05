"use client";

import {
  CaretDownIcon,
  CaretRightIcon,
  CheckIcon,
  CircleNotchIcon,
  XIcon,
} from "@phosphor-icons/react";
import type {
  EveAuthorizationPart,
  EveDynamicToolPart,
  EveMessage,
  EveMessagePart,
} from "eve/react";
import { type ReactNode, useEffect, useState } from "react";
import { ChatMarkdown } from "@/components/chat/chat-markdown";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export type ChatInputResponse = {
  requestId: string;
  optionId?: string;
  text?: string;
};

type RespondFn = (responses: ChatInputResponse[]) => void;

export function ChatMessage({
  canRespond,
  isStreaming,
  message,
  onRespond,
}: {
  canRespond: boolean;
  isStreaming: boolean;
  message: EveMessage;
  onRespond: RespondFn;
}) {
  const isUser = message.role === "user";

  return (
    <article
      className={cn(
        "flex w-full min-w-0",
        isUser ? "justify-end" : "justify-start",
        message.metadata?.optimistic && "opacity-80",
      )}
    >
      <div
        className={cn(
          "min-w-0",
          isUser
            ? "max-w-[85%] rounded-2xl bg-muted px-3 py-1.5 text-sm leading-6"
            : "w-full text-sm leading-6",
        )}
      >
        <MessageParts
          canRespond={canRespond}
          isUser={isUser}
          onRespond={onRespond}
          parts={message.parts}
          showCaret={isStreaming && !isUser}
        />
      </div>
    </article>
  );
}

/** Renders parts in order, folding consecutive tool calls into one row. */
function MessageParts({
  canRespond,
  isUser,
  onRespond,
  parts,
  showCaret,
}: {
  canRespond: boolean;
  isUser: boolean;
  onRespond: RespondFn;
  parts: readonly EveMessagePart[];
  showCaret: boolean;
}) {
  const lastTextIndex = parts.findLastIndex((part) => part.type === "text");
  const elements: ReactNode[] = [];
  let tools: EveDynamicToolPart[] = [];

  const flushTools = (isSettled: boolean) => {
    if (tools.length === 0) return;
    elements.push(
      <ToolGroup
        canRespond={canRespond}
        isSettled={isSettled}
        key={`tools:${tools[0].toolCallId}`}
        onRespond={onRespond}
        parts={tools}
      />,
    );
    tools = [];
  };

  parts.forEach((part, index) => {
    if (part.type === "dynamic-tool") {
      tools.push(part);
      return;
    }
    flushTools(true);
    const key = `${part.type}:${index}`;

    switch (part.type) {
      case "text":
        elements.push(
          isUser ? (
            <div className="break-words whitespace-pre-wrap" key={key}>
              {part.text}
            </div>
          ) : (
            <ChatMarkdown
              caret={showCaret && index === lastTextIndex ? "block" : undefined}
              isAnimating={showCaret && index === lastTextIndex}
              key={key}
            >
              {part.text}
            </ChatMarkdown>
          ),
        );
        break;
      case "reasoning":
        elements.push(
          <ReasoningPart
            isStreaming={part.state === "streaming"}
            key={key}
            text={part.text}
          />,
        );
        break;
      case "authorization":
        elements.push(<AuthorizationPart key={key} part={part} />);
        break;
      case "file":
      case "step-start":
        break;
    }
  });
  flushTools(!showCaret);

  return elements;
}

function ReasoningPart({
  isStreaming,
  text,
}: {
  isStreaming: boolean;
  text: string;
}) {
  const [open, setOpen] = useState(isStreaming);

  useEffect(() => {
    if (isStreaming) setOpen(true);
  }, [isStreaming]);

  return (
    <Collapsible className="my-2 w-full" onOpenChange={setOpen} open={open}>
      <CollapsibleTrigger className="flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground">
        <span className={isStreaming ? "shimmer-text" : undefined}>
          {isStreaming ? "Thinking…" : "Reasoning"}
        </span>
        <CaretDownIcon
          className={cn("size-3 transition-transform", open && "rotate-180")}
        />
      </CollapsibleTrigger>
      <CollapsibleContent className="mt-2 border-l border-border pl-3 text-muted-foreground">
        <ChatMarkdown>{text}</ChatMarkdown>
      </CollapsibleContent>
    </Collapsible>
  );
}

function AuthorizationPart({ part }: { part: EveAuthorizationPart }) {
  if (part.state === "completed") {
    return (
      <p className="my-2 text-xs text-muted-foreground">
        {part.outcome === "authorized"
          ? `${part.displayName} connected.`
          : `${part.displayName} authorization ${part.outcome}.`}
      </p>
    );
  }

  return (
    <div className="my-2 space-y-2 rounded-lg border border-border p-3">
      <p className="text-sm">{part.description}</p>
      {part.authorization?.userCode && (
        <code className="block font-mono text-sm">
          {part.authorization.userCode}
        </code>
      )}
      {part.authorization?.url && (
        <Button asChild size="sm">
          <a href={part.authorization.url} rel="noreferrer" target="_blank">
            Connect {part.displayName}
          </a>
        </Button>
      )}
    </div>
  );
}

type ToolStatus = "running" | "completed" | "error" | "denied";

function ToolGroup({
  canRespond,
  isSettled,
  onRespond,
  parts,
}: {
  canRespond: boolean;
  isSettled: boolean;
  onRespond: RespondFn;
  parts: EveDynamicToolPart[];
}) {
  const needsInput = parts.some(needsInputResponse);
  const [open, setOpen] = useState(needsInput);
  const status = settle(groupStatus(parts), isSettled && !needsInput);
  // Only expandable when there's something to show beyond the summary.
  const canExpand =
    parts.length > 1 ||
    parts.some((part) => part.toolMetadata?.eve?.inputRequest);

  useEffect(() => {
    if (needsInput) setOpen(true);
  }, [needsInput]);

  const summary = (
    <>
      <ToolStatusIcon status={status} />
      <span className="truncate">
        {parts.length === 1
          ? describeTool(parts[0], status)
          : `Used ${parts.length} board tools`}
      </span>
    </>
  );

  if (!canExpand) {
    return (
      <p className="my-1.5 flex max-w-full items-center gap-1.5 text-xs leading-6 text-muted-foreground">
        {summary}
      </p>
    );
  }

  return (
    <Collapsible className="my-1.5" onOpenChange={setOpen} open={open}>
      <CollapsibleTrigger className="group flex max-w-full items-center gap-1.5 text-left text-xs leading-6 text-muted-foreground transition-colors hover:text-foreground">
        {summary}
        <CaretRightIcon
          className={cn(
            "size-3 shrink-0 transition-all",
            open ? "rotate-90" : "opacity-0 group-hover:opacity-100",
          )}
        />
      </CollapsibleTrigger>
      <CollapsibleContent className="mt-1 ml-2 space-y-2 border-l border-border/60 pl-3">
        {parts.map((part) => (
          <ToolDetails
            canRespond={canRespond}
            key={part.toolCallId}
            onRespond={onRespond}
            part={part}
            showLabel={parts.length > 1}
            status={settle(toolStatus(part), isSettled)}
          />
        ))}
      </CollapsibleContent>
    </Collapsible>
  );
}

function ToolDetails({
  canRespond,
  onRespond,
  part,
  showLabel,
  status,
}: {
  canRespond: boolean;
  onRespond: RespondFn;
  part: EveDynamicToolPart;
  showLabel: boolean;
  status: ToolStatus;
}) {
  return (
    <div className="space-y-1.5">
      {showLabel && (
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <ToolStatusIcon status={status} />
          {describeTool(part, status)}
        </p>
      )}
      <InputRequest canRespond={canRespond} onRespond={onRespond} part={part} />
    </div>
  );
}

function ToolStatusIcon({ status }: { status: ToolStatus }) {
  if (status === "running") {
    return <CircleNotchIcon className="size-3 shrink-0 animate-spin" />;
  }
  if (status === "error" || status === "denied") {
    return <XIcon className="size-3 shrink-0 text-destructive" />;
  }
  return <CheckIcon className="size-3 shrink-0 text-emerald-500" />;
}

function InputRequest({
  canRespond,
  onRespond,
  part,
}: {
  canRespond: boolean;
  onRespond: RespondFn;
  part: EveDynamicToolPart;
}) {
  const [text, setText] = useState("");
  const request = part.toolMetadata?.eve?.inputRequest;
  if (!request) return null;

  const response = part.toolMetadata?.eve?.inputResponse;
  if (response) {
    const option = request.options?.find((o) => o.id === response.optionId);
    return (
      <p className="text-xs text-muted-foreground">
        Responded:{" "}
        <span className="font-medium text-foreground">
          {option?.label ?? response.text ?? response.optionId}
        </span>
      </p>
    );
  }

  const sendText = () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    onRespond([{ requestId: request.requestId, text: trimmed }]);
    setText("");
  };

  return (
    <div className="space-y-2 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
      <p className="text-sm">{request.prompt}</p>
      {request.options?.length ? (
        <div className="flex flex-wrap gap-2">
          {request.options.map((option) => (
            <Button
              disabled={!canRespond}
              key={option.id}
              onClick={() =>
                onRespond([
                  { requestId: request.requestId, optionId: option.id },
                ])
              }
              size="sm"
              variant={option.style === "danger" ? "destructive" : "default"}
            >
              {option.label}
            </Button>
          ))}
        </div>
      ) : null}
      {(request.allowFreeform || request.display === "text") && (
        <div className="flex gap-2">
          <Input
            disabled={!canRespond}
            onChange={(event) => setText(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                sendText();
              }
            }}
            placeholder="Type a response"
            value={text}
          />
          <Button
            disabled={!canRespond || !text.trim()}
            onClick={sendText}
            size="sm"
          >
            Reply
          </Button>
        </div>
      )}
    </div>
  );
}

function needsInputResponse(part: EveDynamicToolPart) {
  const eve = part.toolMetadata?.eve;
  return Boolean(eve?.inputRequest && !eve.inputResponse);
}

function toolStatus(part: EveDynamicToolPart): ToolStatus {
  switch (part.state) {
    case "output-available":
      return part.partial ? "running" : "completed";
    case "output-error":
      return "error";
    case "output-denied":
      return "denied";
    default:
      return "running";
  }
}

function groupStatus(parts: EveDynamicToolPart[]): ToolStatus {
  const statuses = parts.map(toolStatus);
  if (statuses.includes("error")) return "error";
  if (statuses.includes("denied")) return "denied";
  if (statuses.includes("running")) return "running";
  return "completed";
}

/** A turn that has moved on can't still be running a tool. */
function settle(status: ToolStatus, isSettled: boolean): ToolStatus {
  return isSettled && status === "running" ? "completed" : status;
}

function describeTool(part: EveDynamicToolPart, status: ToolStatus) {
  const running = status === "running";
  const name = part.toolMetadata?.eve?.name ?? part.toolName;
  const input = (part.input ?? {}) as Record<string, unknown>;

  switch (name) {
    case "list_board_nodes":
      return running ? "Reading the board" : "Read the board";
    case "search_board": {
      const query = typeof input.query === "string" ? input.query : "";
      const verb = running ? "Searching" : "Searched";
      return query ? `${verb} for “${truncate(query, 60)}”` : `${verb} board`;
    }
    case "get_node":
      return running ? "Reading an item" : "Read an item";
    default:
      return `${running ? "Running" : "Ran"} ${name.replace(/[_-]/g, " ")}`;
  }
}

function truncate(text: string, max: number) {
  const normalized = text.replace(/\s+/g, " ").trim();
  return normalized.length <= max
    ? normalized
    : `${normalized.slice(0, max - 1)}…`;
}
