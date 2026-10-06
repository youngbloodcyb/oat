import { defineTool } from "eve/tools";
import { linkSuggestionsSchema } from "@/lib/link-suggestions";

// Nothing is written here: the chat renders the links as cards, and the person
// adds the ones they want to the board with one click.
export default defineTool({
  description:
    "Show the person a set of links (products, articles, places, references) as cards they can add to the board with one click. Use it whenever you recommend specific links. Only pass real URLs you got from a tool result or the board.",
  inputSchema: linkSuggestionsSchema,
  label: {
    start: ({ links }) =>
      `Suggesting ${links.length} link${links.length === 1 ? "" : "s"}`,
  },
  execute({ links }) {
    return { shown: links.length, links };
  },
});
