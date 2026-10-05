CREATE TABLE "board_chat_events" (
	"chat_id" text,
	"event_index" integer,
	"event" jsonb NOT NULL,
	CONSTRAINT "board_chat_events_chatId_eventIndex_pk" PRIMARY KEY("chat_id","event_index")
);
--> statement-breakpoint
CREATE TABLE "board_chats" (
	"id" text PRIMARY KEY,
	"board_id" text NOT NULL,
	"user_id" text NOT NULL,
	"session_id" text,
	"stream_index" integer DEFAULT 0 NOT NULL,
	"event_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "board_chats_boardId_userId_idx" ON "board_chats" ("board_id","user_id");--> statement-breakpoint
CREATE INDEX "board_chats_userId_idx" ON "board_chats" ("user_id");--> statement-breakpoint
ALTER TABLE "board_chat_events" ADD CONSTRAINT "board_chat_events_chat_id_board_chats_id_fkey" FOREIGN KEY ("chat_id") REFERENCES "board_chats"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "board_chats" ADD CONSTRAINT "board_chats_board_id_boards_id_fkey" FOREIGN KEY ("board_id") REFERENCES "boards"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "board_chats" ADD CONSTRAINT "board_chats_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;