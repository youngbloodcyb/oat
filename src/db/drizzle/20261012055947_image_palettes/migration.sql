CREATE TABLE "palettes" (
	"node_id" text PRIMARY KEY,
	"board_id" text NOT NULL,
	"source_key" text NOT NULL,
	"scored_by" text NOT NULL,
	"colors" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "palettes_boardId_idx" ON "palettes" ("board_id");--> statement-breakpoint
ALTER TABLE "palettes" ADD CONSTRAINT "palettes_node_id_nodes_id_fkey" FOREIGN KEY ("node_id") REFERENCES "nodes"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "palettes" ADD CONSTRAINT "palettes_board_id_boards_id_fkey" FOREIGN KEY ("board_id") REFERENCES "boards"("id") ON DELETE CASCADE;