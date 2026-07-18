# Fashion App

A full-stack starter for modern fashion commerce, wired for **fully local development**.

## Tech stack

| Area        | Tools                                                                 |
| ----------- | --------------------------------------------------------------------- |
| Framework   | Next.js 16 (App Router, Turbopack), React 19, TypeScript              |
| UI          | Tailwind CSS v4, shadcn/ui (Base UI · base-nova), Magic UI, Motion, Lucide |
| Forms       | React Hook Form, Zod                                                   |
| State       | Zustand, TanStack Query                                                |
| Database    | PostgreSQL (Neon), Prisma 7 (driver adapter)                          |
| Auth        | Clerk                                                                  |
| AI          | OpenAI, Anthropic (optional)                                           |
| Storage     | Cloudinary                                                             |
| Deploy      | Vercel + Neon                                                          |

Package manager: **Bun**.

## Prerequisites

- [Bun](https://bun.sh) ≥ 1.2
- Node.js ≥ 22 (the Neon WebSocket adapter uses the global `WebSocket`)

## Getting started

```bash
# 1. Install dependencies (also runs `prisma generate`)
bun install

# 2. Create your local env file
cp .env.example .env

# 3. Run the dev server
bun run dev
```

Open [http://localhost:3000](http://localhost:3000).

**You can run the app with zero configuration.** Clerk starts in *keyless mode*
(it provisions a temporary dev instance on first load), and the landing page has
no external dependencies. Add credentials as you build out each feature.

## Environment variables

All variables live in a single `.env` file (gitignored) — read by **both**
Next.js and the Prisma CLI. See [`.env.example`](./.env.example) for the full,
documented list. Summary:

| Variable | Needed for | Where to get it |
| --- | --- | --- |
| `DATABASE_URL` | Prisma / database | [Neon](https://neon.tech) → pooled connection string |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY` | Auth (prod) | [Clerk](https://dashboard.clerk.com) → API keys (leave blank for keyless dev) |
| `OPENAI_API_KEY` | AI stylist route | [OpenAI](https://platform.openai.com) |
| `ANTHROPIC_API_KEY` | Optional AI | [Anthropic](https://console.anthropic.com) |
| `NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` | Media | [Cloudinary](https://console.cloudinary.com) |

## Database

```bash
bun run db:push      # push the schema to your database (no migration files)
bun run db:migrate   # create + apply a migration
bun run db:studio    # open Prisma Studio
bun run db:generate  # regenerate the client
```

The Prisma client is generated to `src/generated/prisma` (gitignored) and
consumed through the lazy `getPrisma()` singleton in
[`src/lib/prisma.ts`](./src/lib/prisma.ts) using the Neon driver adapter.

## Scripts

| Script | Description |
| --- | --- |
| `bun run dev` | Start the dev server (Turbopack) |
| `bun run build` | `prisma generate` + production build |
| `bun run start` | Start the production server |
| `bun run lint` | ESLint |
| `bun run typecheck` | `tsc --noEmit` |
| `bun run db:*` | Prisma helpers (see above) |

## Project structure

```
src/
├── app/
│   ├── api/chat/route.ts     # Clerk-protected OpenAI route handler
│   ├── dashboard/page.tsx    # resource-protected page (auth() + redirect)
│   ├── layout.tsx            # Clerk + Theme + TanStack Query providers
│   └── page.tsx              # landing page (stack showcase)
├── components/
│   ├── forms/                # React Hook Form + Zod
│   ├── providers/            # Query + Theme providers
│   └── ui/                   # shadcn/ui + Magic UI components
├── generated/prisma/         # generated Prisma client (gitignored)
├── lib/                      # prisma, openai, anthropic, cloudinary, env, utils
├── stores/                   # Zustand stores
└── proxy.ts                  # Clerk middleware (Next 16 "proxy" convention)
```

## Adding UI components

```bash
bunx shadcn@latest add button dialog ...      # shadcn/ui
bunx shadcn@latest add @magicui/marquee        # Magic UI (registered in components.json)
```

## AI-assisted development (MCP)

[`.mcp.json`](./.mcp.json) configures four MCP servers for Claude Code: **shadcn**,
**Magic UI**, **21st.dev**, and **Context7**. Claude Code will ask to approve them
when you open the project.

- 21st.dev requires an API key — set `TWENTYFIRST_API_KEY` in your shell env.
- Context7 works without a key (rate-limited).

## Deployment

Deploy to **Vercel** with a **Neon** database:

1. Push this repo to GitHub and import it into Vercel.
2. Add all environment variables from `.env.example` in the Vercel project settings
   (use **real** Clerk keys — keyless mode is dev-only).
3. The `build` script runs `prisma generate` automatically.

Neon's pooled connection string works out of the box with the serverless driver
adapter.
