import type { NodeTypes } from "@xyflow/react";
import { ImageNode } from "./ImageNode";
import { LinkNode } from "./LinkNode";
import { PdfNode } from "./PdfNode";

export const nodeTypes: NodeTypes = {
  link: LinkNode,
  image: ImageNode,
  pdf: PdfNode,
};
