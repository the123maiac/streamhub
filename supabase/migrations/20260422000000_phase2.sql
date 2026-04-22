-- StreamHub Phase 2.
-- Follower counts, edit-profile RPC, ranked feed view.

set search_path = public;

-- =========================================================================
-- profile counters (denormalized for quick reads)
-- =========================================================================
alter table profiles add column if not exists follower_count int not null default 0;
alter table profiles add column if not exists following_count int not null default 0;
alter table profiles add column if not exists video_count int not null default 0;

-- Backfill from existing rows (idempotent).
update profiles p set
  follower_count = coalesce((select count(*) from follows f where f.followee_id = p.id), 0),
  following_count = coalesce((select count(*) from follows f where f.follower_id = p.id), 0),
  video_count = coalesce((select count(*) from videos v
    where v.owner_id = p.id
      and v.visibility = 'public'
      and v.is_removed = false
      and v.status = 'ready'), 0);

create or replace function bump_follow_counts() returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    update profiles set follower_count = follower_count + 1 where id = new.followee_id;
    update profiles set following_count = following_count + 1 where id = new.follower_id;
  elsif tg_op = 'DELETE' then
    update profiles set follower_count = greatest(follower_count - 1, 0) where id = old.followee_id;
    update profiles set following_count = greatest(following_count - 1, 0) where id = old.follower_id;
  end if;
  return null;
end;
$$;

drop trigger if exists follows_bump on follows;
create trigger follows_bump after insert or delete on follows for each row execute function bump_follow_counts();

create or replace function bump_video_count() returns trigger language plpgsql as $$
declare
  was_public boolean;
  is_public boolean;
begin
  if tg_op = 'INSERT' then
    if new.visibility = 'public' and new.is_removed = false and new.status = 'ready' then
      update profiles set video_count = video_count + 1 where id = new.owner_id;
    end if;
  elsif tg_op = 'UPDATE' then
    was_public := (old.visibility = 'public' and old.is_removed = false and old.status = 'ready');
    is_public := (new.visibility = 'public' and new.is_removed = false and new.status = 'ready');
    if was_public and not is_public then
      update profiles set video_count = greatest(video_count - 1, 0) where id = new.owner_id;
    elsif is_public and not was_public then
      update profiles set video_count = video_count + 1 where id = new.owner_id;
    end if;
  elsif tg_op = 'DELETE' then
    if old.visibility = 'public' and old.is_removed = false and old.status = 'ready' then
      update profiles set video_count = greatest(video_count - 1, 0) where id = old.owner_id;
    end if;
  end if;
  return null;
end;
$$;

drop trigger if exists videos_count_bump on videos;
create trigger videos_count_bump after insert or update or delete on videos for each row execute function bump_video_count();

-- =========================================================================
-- edit-profile RPC — validates username uniqueness + format in one call
-- =========================================================================
create or replace function update_own_profile(
  p_username text,
  p_display_name text,
  p_bio text,
  p_ui_theme text
) returns void language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;
  if p_username !~ '^[a-z0-9_]{3,30}$' then
    raise exception 'username must be 3-30 chars: a-z 0-9 _';
  end if;
  if p_ui_theme not in ('dark', 'light', 'system') then
    raise exception 'invalid theme';
  end if;
  update profiles set
    username = p_username,
    display_name = p_display_name,
    bio = nullif(btrim(p_bio), ''),
    ui_theme = p_ui_theme
  where id = uid;
end;
$$;

-- =========================================================================
-- feed ranking view
-- =========================================================================
-- Per spec:
--   score = recency_decay(48h half-life)
--         + 0.3 * log(1 + like_count)
--         + 0.2 * log(1 + view_count)
--         + 0.5 * completion_rate
-- followed-creator bonus is added at query time (depends on viewer).
create or replace view video_feed_scores as
select
  v.id as video_id,
  v.owner_id,
  v.kind,
  v.created_at,
  v.like_count,
  v.view_count,
  exp(-extract(epoch from (now() - v.created_at)) / (48 * 3600) * ln(2))::numeric as recency_decay,
  coalesce((
    select avg(least(vv.watched_seconds / nullif(v.duration_seconds, 0), 1))
    from video_views vv
    where vv.video_id = v.id
  ), 0)::numeric as completion_rate,
  (
    exp(-extract(epoch from (now() - v.created_at)) / (48 * 3600) * ln(2))
    + 0.3 * ln(1 + v.like_count)
    + 0.2 * ln(1 + v.view_count)
    + 0.5 * coalesce((
        select avg(least(vv.watched_seconds / nullif(v.duration_seconds, 0), 1))
        from video_views vv
        where vv.video_id = v.id
      ), 0)
  )::numeric as base_score
from videos v
where v.visibility = 'public'
  and v.is_removed = false
  and v.status = 'ready';

-- Viewer-aware feed RPC. Adds the followed-creator bonus.
create or replace function ranked_feed(p_viewer uuid, p_kind video_kind default null, p_limit int default 24, p_offset int default 0)
returns table (video_id uuid, score numeric) language sql stable as $$
  select
    s.video_id,
    (s.base_score + case when p_viewer is not null and exists (
      select 1 from follows f where f.follower_id = p_viewer and f.followee_id = s.owner_id
    ) then 1.0 else 0.0 end)::numeric as score
  from video_feed_scores s
  where (p_kind is null or s.kind = p_kind)
  order by score desc
  limit p_limit offset p_offset;
$$;

-- Following-only feed (chronological within followed creators).
create or replace function following_feed(p_viewer uuid, p_limit int default 24, p_offset int default 0)
returns setof videos language sql stable as $$
  select v.*
  from videos v
  join follows f on f.followee_id = v.owner_id
  where f.follower_id = p_viewer
    and v.visibility = 'public'
    and v.is_removed = false
    and v.status = 'ready'
  order by v.created_at desc
  limit p_limit offset p_offset;
$$;
