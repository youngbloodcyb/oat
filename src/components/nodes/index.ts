import type { NodeTypes } from "@xyflow/react";
import { ImageNode } from "./image-node";
import { LinkNode } from "./link-node";
import { PdfNode } from "./pdf-node";
import { TextNode } from "./text-node";

export const nodeTypes: NodeTypes = {
  link: LinkNode,
  text: TextNode,
  image: ImageNode,
  pdf: PdfNode,
};
