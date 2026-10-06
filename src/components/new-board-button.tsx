"use client";

import { FilePlusIcon } from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { createBoard } from "@/services/boards";

export function NewBoardButton() {
  const router = useRouter();
  const [creating, setCreating] = useState(false);

  const onCreate = async () => {
    setCreating(true);
    try {
      const id = await createBoard("Untitled board");
      router.push(`/${id}`);
    } finally {
      setCreating(false);
    }
  };

  return (
    <Button size="sm" onClick={onCreate} disabled={creating}>
      New
      <FilePlusIcon data-icon="inline-end" />
    </Button>
  );
}
