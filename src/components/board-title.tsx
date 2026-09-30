"use client";

import { PencilSimpleIcon } from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { getRealtimeClientId } from "@/lib/realtime-client-id";
import { updateBoard } from "@/services/boards";

function messageFrom(error: unknown) {
  return error instanceof Error ? error.message : "Something went wrong";
}

export function BoardTitle({
  boardId,
  name,
  editable,
}: {
  boardId: string;
  name: string;
  editable: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(name);
  const [saving, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  // Pick up the server-refreshed name once it lands, but never while the
  // person is actively typing.
  useEffect(() => {
    if (!editing) setValue(name);
  }, [name, editing]);

  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  if (!editable) {
    return <span className="text-sm font-medium">{name}</span>;
  }

  const commit = () => {
    setEditing(false);
    const trimmed = value.trim();
    if (!trimmed || trimmed === name) {
      setValue(name);
      return;
    }
    startTransition(async () => {
      try {
        await updateBoard(boardId, { name: trimmed }, getRealtimeClientId());
        router.refresh();
      } catch (error) {
        setValue(name);
        toast.error(messageFrom(error));
      }
    });
  };

  if (editing) {
    return (
      <Input
        ref={inputRef}
        value={value}
        onChange={(event) => setValue(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            commit();
          } else if (event.key === "Escape") {
            setValue(name);
            setEditing(false);
          }
        }}
        className="h-7 w-56 text-sm font-medium"
      />
    );
  }

  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      disabled={saving}
      className="group flex items-center gap-1.5 rounded-md px-2 py-1 text-sm font-medium hover:bg-accent disabled:opacity-50"
    >
      {value}
      <PencilSimpleIcon className="size-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
    </button>
  );
}
