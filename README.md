# Frontpage RSS Feed Reader

[![Next.js](https://img.shields.io/badge/Next.js-15-black?logo=nextdotjs)](https://nextjs.org/)
[![React](https://img.shields.io/badge/React-19-149ECA?logo=react&logoColor=white)](https://react.dev/)
[![Supabase](https://img.shields.io/badge/Supabase-Auth%20%26%20Postgres-3ECF8E?logo=supabase&logoColor=white)](https://supabase.com/)
![License: ISC](https://img.shields.io/badge/License-ISC-blue.svg)

A production-ready RSS/Atom feed reader built with Next.js and Supabase.

Frontpage helps users subscribe to feeds, organize sources, search across articles, and track reading state with keyboard-first navigation.

## Preview

<img width="1280" height="800" alt="image" src="https://github.com/user-attachments/assets/564e9556-b3af-448a-96fd-342f4794485d" />

## Features

- Email/password authentication with Supabase Auth
- Feed management (add, validate, refresh, and remove feeds)
- Category organization for subscribed feeds
- Paginated and virtualized article stream for performance
- Full-text search across article title and excerpt
- Read/unread and bookmark state per user
- Global preferences (layout, page size, keyboard shortcuts)
- Profile editing (display name and avatar URL)
- Background refresh endpoint for scheduled jobs

## Why This Project Stands Out

- Keyboard-first reading workflow for speed and accessibility
- Virtualized article rendering for smooth performance on large feeds
- Full-stack architecture with RLS-aware API boundaries
- Production-friendly deployment model (Vercel + Supabase)

## Tech Stack

- Framework: Next.js 15 (App Router)
- Language: TypeScript
- Auth and Database: Supabase (Postgres + RLS)
- UI: React 19 + CSS
- Validation: Zod
- Feed parsing: rss-parser + fast-xml-parser
- Virtualization: @tanstack/react-virtual

## Project Structure

```text
app/
  api/
    articles/
    categories/
    feeds/
    jobs/
    preferences/
    profile/
  auth/
  dashboard/
components/
lib/
supabase/
  migrations/
```

## API Summary

- `GET /api/articles`: list paginated articles with filters
- `PATCH /api/articles/[id]/state`: update read/bookmark state
- `GET/POST /api/categories`: list/create categories
- `PATCH/DELETE /api/categories/[id]`: edit/delete category
- `GET/POST /api/feeds`: list/add feeds
- `PATCH/DELETE /api/feeds/[id]`: update/remove feed
- `POST /api/feeds/[id]/refresh`: refresh one feed
- `POST /api/jobs/refresh`: refresh feeds in batches (cron-safe)
- `GET/PATCH /api/preferences`: user preferences
- `GET/PATCH /api/profile`: display name and avatar URL

## Keyboard Shortcuts

- `/`: focus search
- `j` / `k`: move article selection
- `Enter` or `o`: open selected article
- `m`: toggle read/unread
- `b`: toggle bookmark

## Local Development

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment variables

Create `.env` (or `.env.local`) with:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project-id.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
CRON_SECRET=replace-with-long-random-token
FEED_JOB_BATCH_SIZE=20
```

### 3. Run database migrations

```bash
npx supabase db push
```

### 4. Start the app

```bash
npm run dev
```

### 5. Build for production

```bash
npm run build
npm run start
```

## Deploying to Vercel

1. Import this repository in Vercel.
2. Add all required environment variables in Vercel Project Settings.
3. Redeploy after saving variables.
4. Run Supabase migrations against your target environment (`npx supabase db push`).

## Scheduled Feed Refresh

Use any scheduler (for example Vercel Cron, GitHub Actions, or an external cron provider) to call:

- `POST /api/jobs/refresh`
- Header: `Authorization: Bearer <CRON_SECRET>`

Local test command:

```bash
npm run jobs:refresh
```

## Security Notes

- Never commit real `.env` files.
- Keep `SUPABASE_SERVICE_ROLE_KEY` and `CRON_SECRET` secret.
- Only expose `NEXT_PUBLIC_*` variables to the browser.

## Troubleshooting

- Avatar not persisting: apply latest migration (`202603280003_profiles_avatar.sql`) with `npx supabase db push`.
- Search feels too eager: search is debounced in the dashboard and filters server-side.
- 401 responses from API routes: confirm session and Supabase keys are configured correctly.

## Roadmap

- Digest view implementation
- Discover tab implementation
- OPML import/export UI polish
- Avatar upload via Supabase Storage

## License

ISC
