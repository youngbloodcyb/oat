# Oat

A canvas for ideas. Drop links, text, images, and PDFs onto an infinite board, arrange them freely, and search across everything semantically.

## Stack

- **Next.js 16** (App Router, Turbopack)
- **Better Auth** (email/password, Drizzle adapter)
- **Drizzle ORM** + **PostgreSQL** (pgvector for embeddings)
- **Vercel Blob** (private object storage for images and PDFs)
- **Vercel Functions WebSockets** + **Redis** (realtime boards and presence)
- **Vercel Workflows** (async embedding pipeline)
- **React Flow** + **Zustand** (canvas + interaction cache)

## Getting started

```bash
bun install
bun run db:generate   # generate Drizzle migration
bun run db:migrate    # apply to Postgres
bun run dev
```

You'll need these environment variables:

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Postgres connection string |
| `BETTER_AUTH_SECRET` | Auth session signing secret |
| `SITE_URL` | App base URL |
| `BLOB_READ_WRITE_TOKEN` | Vercel Blob access token |
| `GEMINI_API_KEY` | Server-side Gemini API key for Gemini Embedding 2 text and image embeddings |
| `REDIS_URL` | Native `rediss://` connection used for realtime pub/sub and presence |

## Realtime development

The WebSocket upgrade API is provided by the Vercel runtime, so plain
`bun run dev` does not serve `/api/realtime`. Use a current Vercel CLI with
`vercel dev` when testing realtime behavior locally, and verify reconnect and
multi-instance behavior on a Preview Deployment.

## Scripts

| Command | Description |
|---|---|
| `bun run dev` | Start dev server |
| `bun run build` | Production build |
| `bun run test` | Run Vitest suite |
| `bun run lint` | Biome check |
| `bun run db:generate` | Generate Drizzle migration |
| `bun run db:migrate` | Apply migrations to Postgres |
| `bun run db:studio` | Open Drizzle Studio |
