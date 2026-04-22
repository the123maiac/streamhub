# StreamHub

A social video, livestream, and chat platform.

Stack: **Next.js 15 + Supabase + Ably + Livepeer Studio + FFmpeg worker**. Deploys to Render.

## What's in this repo today (Phases 1–2)

**Phase 1**
- Next.js 15 app (App Router, TypeScript, Tailwind)
- Supabase schema + RLS policies for the entire spec
- Auth (email/password + Google OAuth)
- Short + long-form upload with client-side probe
- Worker that polls `processing_jobs` and runs FFmpeg
- Feed, Shorts index, watch page, short player page, comments, likes, profile pages, search
- Ably token endpoint + rate-limit primitives
- Render blueprint (`render.yaml`) with `web` + `worker` services

**Phase 2** (current)
- Adaptive HLS ladder for long-form videos (360p / 720p / 1080p + master playlist)
- Ranked feed via the `ranked_feed` RPC — recency decay + like/view log + completion rate + follow bonus (per the design doc formula)
- Following-only feed tab on `/?tab=following`
- Follow / unfollow API + `FollowButton` + denormalized `follower_count` / `following_count` / `video_count` with trigger maintenance
- Profile page polish: stats row, follow button, edit link
- Edit-profile page with avatar upload and `update_own_profile` RPC

Later phases (livestream, DMs, editor, music library, analytics, moderation UI, notifications) are stubbed with placeholder pages but not implemented.

## Local setup

### Prerequisites
- Node 20+
- `ffmpeg` and `ffprobe` on your `PATH` (the worker shells out to them)
- A Supabase project (free tier is fine)
- An Ably account (free tier is fine)
- A Livepeer Studio account (free tier is fine) — only needed when you add livestreaming in Phase 3
- [Supabase CLI](https://supabase.com/docs/guides/cli) for running migrations locally

### Install
```bash
npm install
cp .env.example .env.local
# fill in your Supabase + Ably keys
```

### Apply the schema
Connect to your Supabase project and run the migration:
```bash
supabase link --project-ref <your-ref>
supabase db push
```
Or paste `supabase/migrations/20260421000000_initial_schema.sql` into the Supabase SQL editor.

### Enable Google OAuth (optional)
Supabase Dashboard → Authentication → Providers → Google. Add authorized redirect URI:
`https://<your-supabase-ref>.supabase.co/auth/v1/callback`.

### Run
```bash
# Terminal 1 — web app
npm run dev

# Terminal 2 — worker
npm run worker:dev
```

Open http://localhost:3000, sign up, upload a video, and wait ~10s — the worker will transcode it and the feed will show it.

## Architecture

See [`docs/specs/2026-04-21-streamhub-design.md`](docs/specs/2026-04-21-streamhub-design.md) for the full design and phased rollout plan.

### Key flows in Phase 1
- **Upload:** browser probes the file → uploads to Supabase Storage (`videos` bucket, per-user folder) → `/api/videos` inserts a `videos` row (status=`processing`) and a `transcode` job → worker claims the job → downloads, runs FFmpeg, uploads HLS + thumbnail to public buckets → sets status=`ready`.
- **Playback:** watch/short page reads the row, renders `<video>` with `hls.js` pointing at the public HLS URL.
- **Feed:** Postgres query filtered to `visibility='public' and is_removed=false and status='ready'`, newest first. Ranking formula (from the spec) lands in Phase 2.

## Deploy to Render
1. Push this repo to GitHub.
2. Render dashboard → **Blueprints → New** → select the repo. Render reads `render.yaml` and provisions the `web` and `worker` services.
3. Set the env vars in the `streamhub-shared` env group.
4. First deploy will run `npm ci && npm run build` for web and `npm ci` for worker.
5. `ffmpeg` is pre-installed on Render's Node image. If that changes, add an apt-install to the build command.

## Directory map
```
app/                     # Next.js App Router pages + API routes
components/              # Client + server React components
lib/
  supabase/              # Browser, server, service-role, middleware clients
  ably/                  # Ably realtime + REST helpers
  livepeer/              # Livepeer Studio REST client
  rate-limit.ts          # Token bucket backed by Postgres
  format.ts, storage.ts  # Small utilities
worker/                  # Long-running Node process (FFmpeg, job queue)
  index.ts               # Poll loop
  db.ts, ffmpeg.ts, storage.ts
  jobs/                  # Per-job handlers (transcode, vod-import, …)
supabase/
  migrations/            # Schema + RLS (single initial migration)
docs/specs/              # Design documents
render.yaml              # Render blueprint
```

## Phase roadmap
| Phase | Scope |
|---|---|
| **1** (this repo) | Scaffold, schema, auth, short-form upload + feed + comments + likes |
| 2 | Long-form ladder, feed ranking view, follows, profile polish |
| 3 | Livestream (Livepeer + chat via Ably), VOD import |
| 4 | Messaging: DMs + groups + presence + read receipts |
| 5 | Music library + reusable audio |
| 6 | In-app editor (shorts first, long-form second) |
| 7 | Analytics, moderation UI, notifications |
| 8 | Hardening: Sentry, Playwright E2E, Render prod deploy |
