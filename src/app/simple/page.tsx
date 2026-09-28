import { Suspense } from "react";
import { SimpleEditor } from "@/components/tiptap/simple/simple-editor";

export default function Page() {
  // The editor calls Math.random() while rendering, so it can't be prerendered.
  return (
    <Suspense>
      <SimpleEditor />
    </Suspense>
  );
}
