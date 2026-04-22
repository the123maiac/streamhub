# StreamHub — Design Spec

**Date:** 2026-04-21
**Status:** Approved for Phase 1 implementation
**Scope slice:** Video posting (shorts + long-form), livestreaming, chat (livestream + comments + DMs + group).

---

## 1. System Architecture

**Stack**
- Frontend: Next.js 15 (App Router) + TypeScript + Tailwind. Deployed on Render Web Service.
- Auth + DB + Storage: Supabase. Email/password + Google OAuth. Postgres + RLS. Storage buckets.
- Realtime: Ably. Chat, presence, notifications.
- Livestream: Livepeer Studio. RTMP ingest + HLS playback + VOD export.
- Media processing: FFmpeg in a Render Background Worker that consumes a `processing_jobs` table.

**Two Render services**
1. `web` — Next.js (UI, API routes, webhooks)
2. `worker` — Node process polling `processing_jobs`, shelling out to FFmpeg

**Upload data flow:** browser → Supabase Storage (resumable) → DB row `videos` status=`uploaded` → worker picks it up → transcodes → status=`ready` → Ably notify uploader.

**Livestream data flow:** creator gets RTMP URL + key from Livepeer → streams via OBS or browser → Livepeer webhook start/stop → on stop, import VOD into Supabase Storage → Ably broadcasts chat on channel `stream:{id}`.

## 2. Data Model

All tables have `id uuid`, `created_at`, `updated_at`. RLS is on by default.

### Identity & social
- `profiles` — 1:1 with `auth.users`: `username` (unique), `display_name`, `avatar_url`, `bio`, `role` (`user`|`moderator`|`admin`), `is_banned`, `ui_theme`, `email_verified_at`.
- `follows` — `(follower_id, followee_id)` composite PK.

### Videos
- `videos` — `owner_id`, `kind` (`short`|`long`), `title`, `description`, `status` (`uploading`|`processing`|`ready`|`failed`), `source_path`, `hls_manifest_path`, `mp4_path`, `thumbnail_path`, `duration_seconds`, `width`, `height`, `view_count`, `like_count`, `visibility` (`public`|`unlisted`|`private`), `is_removed`.
- `video_likes` — `(user_id, video_id)`.
- `video_views` — append-only: `video_id`, `viewer_id nullable`, `watched_seconds`, `created_at`.
- `video_comments` — `video_id`, `author_id`, `body`, `parent_comment_id nullable`, `is_removed`.
- `comment_likes` — `(user_id, comment_id)`.

### Music / audio
- `audio_tracks` — `owner_id`, `title`, `source` (`user_upload`|`platform_library`|`video_extract`), `file_path`, `duration_seconds`, `is_reusable`, `use_count`, `source_video_id nullable`.
- `video_audio_uses` — `(video_id, audio_track_id)`.

### Livestream
- `streams` — `owner_id`, `livepeer_stream_id`, `playback_id`, `stream_key` (secret), `title`, `description`, `category`, `status` (`idle`|`live`|`ended`), `started_at`, `ended_at`, `peak_viewers`, `vod_video_id nullable`.

### Messaging
- `conversations` — `kind` (`dm`|`group`), `title nullable`, `created_by`.
- `conversation_members` — `(conversation_id, user_id)`, `joined_at`, `last_read_at`.
- `messages` — `conversation_id`, `author_id`, `body`, `media_url nullable`, `ably_message_id`, `created_at`.

### Moderation
- `reports` — `reporter_id`, `target_type`, `target_id`, `reason`, `status` (`open`|`actioned`|`dismissed`), `moderator_id nullable`.
- `bans` — `user_id`, `reason`, `expires_at nullable`.

### Jobs
- `processing_jobs` — `kind` (`transcode`|`thumbnail`|`edit`|`vod_import`), `video_id nullable`, `payload jsonb`, `status`, `attempts`, `error`.

### Key RLS
- `profiles`: public read; update only own row.
- `videos`: public read when `visibility='public' AND is_removed=false`; full access to owner; moderators read/update all.
- `messages`: select only if member of conversation.
- `reports`: insert by any auth user; select/update only by moderators.

## 3. Video Pipeline + Editor

### Upload
1. Signed Supabase upload URL → resumable upload from browser.
2. POST `/api/videos` with metadata + storage path → `videos` row status=`uploading`; enqueue `transcode` job.
3. Worker: `short` → single 720x1280 HLS + MP4. `long` → adaptive ladder 360p/720p/1080p + poster.
4. Thumbnail @ 2s mark.
5. Status → `ready`, Ably notify uploader.

### Editor split
- Shorts (≤60s vertical) — client `ffmpeg.wasm`. Trim, filters, captions, overlays, audio mix.
- Long-form — client sends raw file + JSON edit spec; worker renders server-side.

### Editor capabilities (v1)
- Trim start/end
- 6–8 built-in LUT filters
- Text overlays (font, color, position, start/end) — burned in
- Captions — Whisper auto-gen or SRT upload; burned in for shorts, soft track for long-form
- Audio — replace/mix from user upload, platform library, or reusable community audio; volume ducking

### Explicitly deferred (v2+)
- Chroma key, multi-clip splicing, transitions, speed ramping, stickers/GIFs

### Reusable audio
- Any public video's audio becomes an `audio_tracks` row on demand.
- "Use this sound" button opens editor pre-loaded.
- `use_count` tracked; detail page lists all videos using it.

## 4. Livestream + Chat + Realtime

### Livestream lifecycle
1. "Go Live" → Livepeer API creates stream → save `livepeer_stream_id`, `playback_id`, `stream_key`.
2. Show creator RTMP URL+key (OBS) or browser capture (Livepeer web SDK).
3. Livepeer webhook `stream.started` → status `live`, Ably broadcast `stream.started` to followers.
4. Viewers load HLS playback + subscribe to `stream:{stream_id}` on Ably for chat + presence.
5. Webhook `stream.ended` → enqueue `vod_import`, create `videos` row `kind=long`, link via `streams.vod_video_id`.

### Chat architecture

| Chat type | Ably channel | Persistence |
|---|---|---|
| Livestream chat | `stream:{stream_id}` | Ably history 24h; optional archive if creator opts in |
| Video comments | none | `video_comments` table; Ably `user:{id}:notifications` ping only |
| DMs | `dm:{conversation_id}` | Ably + mirror to `messages` |
| Groups | `group:{conversation_id}` | Ably + mirror to `messages` |

Mirror flow: client publishes to Ably → Ably webhook to `/api/ably/message-webhook` → insert into `messages` (server validates membership). Read receipts = `conversation_members.last_read_at`.

### Presence
Ably presence on every channel. Powers online indicators, viewer counts, typing indicators.

### Notifications
- Realtime: Ably personal channel `user:{user_id}:notifications`.
- Fallback: `notifications` table + in-app inbox.

### Rate limits
- Chat: 5 messages / 10s per user per channel.
- Uploads: 10 videos / day per user.
- Stream starts: 5 / day per user.
- Reports: 20 / hour per user.

### Moderation
- Admin queue of open `reports` with preview.
- Actions: remove content, ban user, dismiss.
- Auto-hide on 5+ unique reports pending review.

## 5. Pages, Search, Analytics, Observability

### Next.js routes
| Route | Purpose |
|---|---|
| `/` | Home feed — tabs: Shorts / Videos / Live / Following |
| `/shorts` | Vertical swipe feed |
| `/watch/[id]` | Long-form player + comments |
| `/s/[id]` | Shorts player + comments |
| `/live/[playback_id]` | Livestream viewer + chat |
| `/u/[username]` | Profile |
| `/upload` | Upload launcher |
| `/edit/[video_id]` | Editor |
| `/go-live` | Stream setup |
| `/music` | Music library |
| `/messages`, `/messages/[conversation_id]` | Messaging |
| `/search?q=` | Tabbed results |
| `/notifications` | Inbox |
| `/studio` | Creator analytics |
| `/studio/moderation` | Moderator queue |
| `/settings` | Account + theme |

### Feed ranking
```
score = recency_decay(created_at, half_life=48h)
      + 0.3 * log(1 + like_count)
      + 0.2 * log(1 + view_count)
      + 0.5 * completion_rate
      + 1.0 * followed_creator_bonus
```
SQL view; materialized + refreshed every 5 min once query cost warrants.

### Search
Postgres FTS on `videos.title+description`, `profiles.username+display_name+bio`, `audio_tracks.title`, `streams.title+category`. Meilisearch later if needed.

### Analytics (`/studio`)
- Cards: views, watch minutes, new followers, likes (7/30 days).
- Per-video table: views, avg watch %, likes, comments, shares.
- Top audio.
- Cached 10 min.

### Theming
Dark mode default, light toggle, persisted in `localStorage` + `profiles.ui_theme`. Tailwind tokens. Hand-rolled primitives.

### Observability
- Structured logs → Render.
- Sentry free tier (web + worker).
- `/api/health` + UptimeRobot.
- `/studio/admin/jobs` for stuck/failed jobs.

### Testing
- Vitest: feed ranking SQL, edit-spec interpreter, rate limiter, RLS fixtures.
- Playwright: signup→upload short→feed; go live→chat round-trip; DM round-trip.
- Migrations + seeds in `supabase/`.

### Secrets
`.env.local` dev; Render env groups prod. Separate Supabase projects per env.

## 6. Phased Rollout

| Phase | Scope |
|---|---|
| **1 (this session)** | Scaffold, schema, auth, short-form upload + transcode + feed + basic comments |
| 2 | Long-form upload, playback polish, profiles, follows, likes |
| 3 | Livestream (Livepeer + chat via Ably) |
| 4 | Messaging (DMs + groups) |
| 5 | Music library + reusable audio |
| 6 | Editor (shorts first, long-form second) |
| 7 | Analytics, moderation UI, search, notifications |
| 8 | Hardening: rate limits, Sentry, Playwright E2E, Render deploy |
