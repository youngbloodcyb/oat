import type { Icon } from "@phosphor-icons/react";
import {
  FilePdfIcon,
  ImageIcon,
  LinkIcon,
  TextTIcon,
} from "@phosphor-icons/react";
import type { NodeType } from "@/db/schema";

export const nodeIcons: Record<NodeType, Icon> = {
  link: LinkIcon,
  text: TextTIcon,
  image: ImageIcon,
  pdf: FilePdfIcon,
};
