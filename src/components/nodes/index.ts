import type { NodeTypes } from "@xyflow/react";
import { ImageNode } from "./image-node";
import { LinkNode } from "./link-node";
import { PdfNode } from "./pdf-node";

export const nodeTypes: NodeTypes = {
  link: LinkNode,
  image: ImageNode,
  pdf: PdfNode,
};
