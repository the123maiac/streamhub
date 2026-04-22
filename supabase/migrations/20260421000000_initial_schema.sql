-- StreamHub initial schema.
-- Tables, indexes, triggers, and RLS policies for Phase 1+.

set search_path = public;

create extension if not exists pg_trgm;

-- =========================================================================
-- profiles
-- =========================================================================
create type user_role as enum ('user', 'moderator', 'admin');

create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique not null check (char_length(username) between 3 and 30 and username ~ '^[a-z0-9_]+$'),
  display_name text not null check (char_length(display_name) between 1 and 60),
  avatar_url text,
  bio text check (bio is null or char_length(bio) <= 500),
  role user_role not null default 'user',
  is_banned boolean not null default false,
  ui_theme text not null default 'dark' check (ui_theme in ('dark', 'light', 'system')),
  email_verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index profiles_username_trgm_idx on profiles using gin (username gin_trgm_ops);

-- =========================================================================
-- follows
-- =========================================================================
create table follows (
  follower_id uuid not null references profiles(id) on delete cascade,
  followee_id uuid not null references profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, followee_id),
  check (follower_id <> followee_id)
);

create index follows_followee_idx on follows(followee_id);

-- =========================================================================
-- videos
-- =========================================================================
create type video_kind as enum ('short', 'long');
create type video_status as enum ('uploading', 'processing', 'ready', 'failed');
create type video_visibility as enum ('public', 'unlisted', 'private');

create table videos (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references profiles(id) on delete cascade,
  kind video_kind not null,
  title text not null check (char_length(title) between 1 and 200),
  description text check (description is null or char_length(description) <= 5000),
  status video_status not null default 'uploading',
  source_path text,
  hls_manifest_path text,
  mp4_path text,
  thumbnail_path text,
  duration_seconds numeric(10, 2),
  width int,
  height int,
  view_count bigint not null default 0,
  like_count bigint not null default 0,
  visibility video_visibility not null default 'public',
  is_removed boolean not null default false,
  search_tsv tsvector generated always as (
    setweight(to_tsvector('simple', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('simple', coalesce(description, '')), 'B')
  ) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index videos_owner_idx on videos(owner_id, created_at desc);
create index videos_public_idx on videos(created_at desc) where visibility = 'public' and is_removed = false and status = 'ready';
create index videos_kind_idx on videos(kind, created_at desc) where visibility = 'public' and is_removed = false and status = 'ready';
create index videos_search_idx on videos using gin (search_tsv);

-- =========================================================================
-- video_likes
-- =========================================================================
create table video_likes (
  user_id uuid not null references profiles(id) on delete cascade,
  video_id uuid not null references videos(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, video_id)
);

create index video_likes_video_idx on video_likes(video_id);

-- =========================================================================
-- video_views
-- =========================================================================
create table video_views (
  id bigserial primary key,
  video_id uuid not null references videos(id) on delete cascade,
  viewer_id uuid references profiles(id) on delete set null,
  watched_seconds numeric(10, 2) not null default 0,
  created_at timestamptz not null default now()
);

create index video_views_video_idx on video_views(video_id, created_at desc);
create index video_views_viewer_idx on video_views(viewer_id, created_at desc) where viewer_id is not null;

-- =========================================================================
-- video_comments
-- =========================================================================
create table video_comments (
  id uuid primary key default gen_random_uuid(),
  video_id uuid not null references videos(id) on delete cascade,
  author_id uuid not null references profiles(id) on delete cascade,
  parent_comment_id uuid references video_comments(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 2000),
  is_removed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index video_comments_video_idx on video_comments(video_id, created_at desc) where is_removed = false;

create table comment_likes (
  user_id uuid not null references profiles(id) on delete cascade,
  comment_id uuid not null references video_comments(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, comment_id)
);

-- =========================================================================
-- audio_tracks
-- =========================================================================
create type audio_source as enum ('user_upload', 'platform_library', 'video_extract');

create table audio_tracks (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references profiles(id) on delete set null,
  title text not null check (char_length(title) between 1 and 200),
  source audio_source not null,
  file_path text not null,
  duration_seconds numeric(10, 2),
  is_reusable boolean not null default true,
  use_count bigint not null default 0,
  source_video_id uuid references videos(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index audio_tracks_owner_idx on audio_tracks(owner_id, created_at desc);
create index audio_tracks_popular_idx on audio_tracks(use_count desc) where is_reusable = true;

create table video_audio_uses (
  video_id uuid not null references videos(id) on delete cascade,
  audio_track_id uuid not null references audio_tracks(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (video_id, audio_track_id)
);

-- =========================================================================
-- streams
-- =========================================================================
create type stream_status as enum ('idle', 'live', 'ended');

create table streams (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references profiles(id) on delete cascade,
  livepeer_stream_id text unique,
  playback_id text unique,
  stream_key text,
  title text not null check (char_length(title) between 1 and 200),
  description text check (description is null or char_length(description) <= 2000),
  category text,
  status stream_status not null default 'idle',
  started_at timestamptz,
  ended_at timestamptz,
  peak_viewers int not null default 0,
  vod_video_id uuid references videos(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index streams_owner_idx on streams(owner_id, created_at desc);
create index streams_live_idx on streams(started_at desc) where status = 'live';

-- =========================================================================
-- messaging
-- =========================================================================
create type conversation_kind as enum ('dm', 'group');

create table conversations (
  id uuid primary key default gen_random_uuid(),
  kind conversation_kind not null,
  title text,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table conversation_members (
  conversation_id uuid not null references conversations(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  joined_at timestamptz not null default now(),
  last_read_at timestamptz not null default now(),
  primary key (conversation_id, user_id)
);

create index conversation_members_user_idx on conversation_members(user_id);

create table messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversations(id) on delete cascade,
  author_id uuid not null references profiles(id) on delete cascade,
  body text,
  media_url text,
  ably_message_id text,
  created_at timestamptz not null default now(),
  check (body is not null or media_url is not null)
);

create index messages_conversation_idx on messages(conversation_id, created_at desc);

-- =========================================================================
-- moderation
-- =========================================================================
create type report_status as enum ('open', 'actioned', 'dismissed');

create table reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references profiles(id) on delete cascade,
  target_type text not null check (target_type in ('video', 'comment', 'user', 'stream', 'message')),
  target_id uuid not null,
  reason text not null check (char_length(reason) between 3 and 2000),
  status report_status not null default 'open',
  moderator_id uuid references profiles(id) on delete set null,
  moderator_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index reports_open_idx on reports(created_at desc) where status = 'open';
create index reports_target_idx on reports(target_type, target_id);

create table bans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  reason text not null,
  expires_at timestamptz,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index bans_user_idx on bans(user_id, expires_at);

-- =========================================================================
-- jobs
-- =========================================================================
create type job_kind as enum ('transcode', 'thumbnail', 'edit', 'vod_import');
create type job_status as enum ('queued', 'running', 'done', 'failed');

create table processing_jobs (
  id uuid primary key default gen_random_uuid(),
  kind job_kind not null,
  video_id uuid references videos(id) on delete cascade,
  stream_id uuid references streams(id) on delete cascade,
  payload jsonb not null default '{}'::jsonb,
  status job_status not null default 'queued',
  attempts int not null default 0,
  error text,
  locked_by text,
  locked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index processing_jobs_queue_idx on processing_jobs(created_at) where status = 'queued';

-- =========================================================================
-- notifications
-- =========================================================================
create table notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  kind text not null,
  payload jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index notifications_user_idx on notifications(user_id, created_at desc);
create index notifications_unread_idx on notifications(user_id, created_at desc) where read_at is null;

-- =========================================================================
-- rate limiting
-- =========================================================================
create table rate_limit_buckets (
  key text primary key,
  tokens int not null,
  refilled_at timestamptz not null default now()
);

-- =========================================================================
-- triggers
-- =========================================================================
create or replace function set_updated_at() returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at before update on profiles for each row execute function set_updated_at();
create trigger videos_set_updated_at before update on videos for each row execute function set_updated_at();
create trigger audio_tracks_set_updated_at before update on audio_tracks for each row execute function set_updated_at();
create trigger streams_set_updated_at before update on streams for each row execute function set_updated_at();
create trigger conversations_set_updated_at before update on conversations for each row execute function set_updated_at();
create trigger video_comments_set_updated_at before update on video_comments for each row execute function set_updated_at();
create trigger reports_set_updated_at before update on reports for each row execute function set_updated_at();
create trigger processing_jobs_set_updated_at before update on processing_jobs for each row execute function set_updated_at();

-- Auto-create a profiles row whenever auth.users gets an entry.
create or replace function handle_new_user() returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, username, display_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'username', 'user_' || substr(new.id::text, 1, 8)),
    coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1), 'New User')
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function handle_new_user();

-- Keep counters fresh.
create or replace function bump_like_count() returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    update videos set like_count = like_count + 1 where id = new.video_id;
  elsif tg_op = 'DELETE' then
    update videos set like_count = greatest(like_count - 1, 0) where id = old.video_id;
  end if;
  return null;
end;
$$;

create trigger video_likes_bump after insert or delete on video_likes for each row execute function bump_like_count();

create or replace function bump_audio_use_count() returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    update audio_tracks set use_count = use_count + 1 where id = new.audio_track_id;
  elsif tg_op = 'DELETE' then
    update audio_tracks set use_count = greatest(use_count - 1, 0) where id = old.audio_track_id;
  end if;
  return null;
end;
$$;

create trigger video_audio_uses_bump after insert or delete on video_audio_uses for each row execute function bump_audio_use_count();

-- =========================================================================
-- helpers
-- =========================================================================
create or replace function increment_video_views(p_video_id uuid) returns void language sql security definer set search_path = public as $$
  update videos set view_count = view_count + 1 where id = p_video_id;
$$;

create or replace function claim_processing_job(p_worker text)
returns table (id uuid, kind job_kind, video_id uuid, stream_id uuid, payload jsonb, attempts int)
language plpgsql security definer set search_path = public as $$
declare
  j record;
begin
  select j2.id into j
  from processing_jobs j2
  where j2.status = 'queued'
  order by j2.created_at
  for update skip locked
  limit 1;

  if not found then
    return;
  end if;

  update processing_jobs
    set status = 'running',
        attempts = attempts + 1,
        locked_by = p_worker,
        locked_at = now()
    where processing_jobs.id = j.id
    returning processing_jobs.id, processing_jobs.kind, processing_jobs.video_id, processing_jobs.stream_id, processing_jobs.payload, processing_jobs.attempts
    into id, kind, video_id, stream_id, payload, attempts;

  return next;
end;
$$;

create or replace function is_moderator(uid uuid) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = uid and role in ('moderator', 'admin'));
$$;

create or replace function is_conversation_member(conv_id uuid, uid uuid) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from conversation_members where conversation_id = conv_id and user_id = uid);
$$;

-- =========================================================================
-- RLS
-- =========================================================================
alter table profiles enable row level security;
alter table follows enable row level security;
alter table videos enable row level security;
alter table video_likes enable row level security;
alter table video_views enable row level security;
alter table video_comments enable row level security;
alter table comment_likes enable row level security;
alter table audio_tracks enable row level security;
alter table video_audio_uses enable row level security;
alter table streams enable row level security;
alter table conversations enable row level security;
alter table conversation_members enable row level security;
alter table messages enable row level security;
alter table reports enable row level security;
alter table bans enable row level security;
alter table processing_jobs enable row level security;
alter table notifications enable row level security;
alter table rate_limit_buckets enable row level security;

-- profiles
create policy profiles_public_read on profiles for select using (true);
create policy profiles_self_update on profiles for update using (auth.uid() = id) with check (auth.uid() = id);
create policy profiles_mod_update on profiles for update using (is_moderator(auth.uid()));

-- follows
create policy follows_public_read on follows for select using (true);
create policy follows_self_write on follows for insert with check (auth.uid() = follower_id);
create policy follows_self_delete on follows for delete using (auth.uid() = follower_id);

-- videos
create policy videos_public_read on videos for select using (
  (visibility = 'public' and is_removed = false) or owner_id = auth.uid() or is_moderator(auth.uid())
);
create policy videos_owner_insert on videos for insert with check (auth.uid() = owner_id);
create policy videos_owner_update on videos for update using (auth.uid() = owner_id or is_moderator(auth.uid()));
create policy videos_owner_delete on videos for delete using (auth.uid() = owner_id or is_moderator(auth.uid()));

-- video_likes
create policy video_likes_read on video_likes for select using (true);
create policy video_likes_self_insert on video_likes for insert with check (auth.uid() = user_id);
create policy video_likes_self_delete on video_likes for delete using (auth.uid() = user_id);

-- video_views (anyone can append; only self/mods can read per-viewer history)
create policy video_views_insert on video_views for insert with check (true);
create policy video_views_read on video_views for select using (
  viewer_id = auth.uid() or is_moderator(auth.uid()) or exists (
    select 1 from videos v where v.id = video_id and v.owner_id = auth.uid()
  )
);

-- video_comments
create policy video_comments_read on video_comments for select using (
  is_removed = false or author_id = auth.uid() or is_moderator(auth.uid())
);
create policy video_comments_insert on video_comments for insert with check (auth.uid() = author_id);
create policy video_comments_update on video_comments for update using (auth.uid() = author_id or is_moderator(auth.uid()));

-- comment_likes
create policy comment_likes_read on comment_likes for select using (true);
create policy comment_likes_self_insert on comment_likes for insert with check (auth.uid() = user_id);
create policy comment_likes_self_delete on comment_likes for delete using (auth.uid() = user_id);

-- audio_tracks
create policy audio_tracks_read on audio_tracks for select using (true);
create policy audio_tracks_owner_insert on audio_tracks for insert with check (auth.uid() = owner_id);
create policy audio_tracks_owner_update on audio_tracks for update using (auth.uid() = owner_id or is_moderator(auth.uid()));
create policy audio_tracks_owner_delete on audio_tracks for delete using (auth.uid() = owner_id or is_moderator(auth.uid()));

-- video_audio_uses
create policy video_audio_uses_read on video_audio_uses for select using (true);
create policy video_audio_uses_insert on video_audio_uses for insert with check (
  exists (select 1 from videos v where v.id = video_id and v.owner_id = auth.uid())
);

-- streams
create policy streams_read on streams for select using (
  status in ('live', 'ended') or owner_id = auth.uid() or is_moderator(auth.uid())
);
create policy streams_owner_insert on streams for insert with check (auth.uid() = owner_id);
create policy streams_owner_update on streams for update using (auth.uid() = owner_id or is_moderator(auth.uid()));
create policy streams_owner_delete on streams for delete using (auth.uid() = owner_id or is_moderator(auth.uid()));

-- conversations + members + messages
create policy conversations_member_read on conversations for select using (is_conversation_member(id, auth.uid()));
create policy conversations_self_create on conversations for insert with check (auth.uid() = created_by);

create policy conversation_members_read on conversation_members for select using (is_conversation_member(conversation_id, auth.uid()));
create policy conversation_members_self_update on conversation_members for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy messages_member_read on messages for select using (is_conversation_member(conversation_id, auth.uid()));
create policy messages_member_insert on messages for insert with check (
  auth.uid() = author_id and is_conversation_member(conversation_id, auth.uid())
);

-- reports
create policy reports_self_insert on reports for insert with check (auth.uid() = reporter_id);
create policy reports_mod_read on reports for select using (is_moderator(auth.uid()) or reporter_id = auth.uid());
create policy reports_mod_update on reports for update using (is_moderator(auth.uid()));

-- bans
create policy bans_mod_read on bans for select using (is_moderator(auth.uid()) or user_id = auth.uid());
create policy bans_mod_write on bans for insert with check (is_moderator(auth.uid()));

-- processing_jobs: service-role only — no policies granted to authenticated users.

-- notifications
create policy notifications_owner_read on notifications for select using (auth.uid() = user_id);
create policy notifications_owner_update on notifications for update using (auth.uid() = user_id);

-- rate_limit_buckets: service-role only.

-- =========================================================================
-- storage buckets
-- =========================================================================
insert into storage.buckets (id, name, public) values ('videos', 'videos', false) on conflict do nothing;
insert into storage.buckets (id, name, public) values ('hls', 'hls', true) on conflict do nothing;
insert into storage.buckets (id, name, public) values ('thumbnails', 'thumbnails', true) on conflict do nothing;
insert into storage.buckets (id, name, public) values ('audio', 'audio', true) on conflict do nothing;
insert into storage.buckets (id, name, public) values ('avatars', 'avatars', true) on conflict do nothing;

create policy "videos bucket - owner write" on storage.objects for insert to authenticated
  with check (bucket_id = 'videos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "videos bucket - owner read" on storage.objects for select to authenticated
  using (bucket_id = 'videos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "videos bucket - owner delete" on storage.objects for delete to authenticated
  using (bucket_id = 'videos' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "hls bucket - public read" on storage.objects for select using (bucket_id = 'hls');
create policy "thumbnails bucket - public read" on storage.objects for select using (bucket_id = 'thumbnails');
create policy "audio bucket - public read" on storage.objects for select using (bucket_id = 'audio');
create policy "avatars bucket - public read" on storage.objects for select using (bucket_id = 'avatars');

create policy "avatars bucket - owner write" on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "avatars bucket - owner update" on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "audio bucket - owner write" on storage.objects for insert to authenticated
  with check (bucket_id = 'audio' and (storage.foldername(name))[1] = auth.uid()::text);
