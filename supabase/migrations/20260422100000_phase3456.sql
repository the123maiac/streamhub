-- StreamHub Phases 3-6.
-- Messaging RPCs, stream lifecycle helpers, and RLS tweaks for new flows.

set search_path = public;

-- =========================================================================
-- Messaging: DM/group helpers
-- =========================================================================
-- Returns (conversation_id, created) for the DM between two users.
create or replace function ensure_dm(p_other uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  conv_id uuid;
begin
  if uid is null then raise exception 'not authenticated'; end if;
  if uid = p_other then raise exception 'cannot DM yourself'; end if;

  -- Find an existing DM where both users are members.
  select c.id into conv_id
  from conversations c
  where c.kind = 'dm'
    and exists (select 1 from conversation_members m where m.conversation_id = c.id and m.user_id = uid)
    and exists (select 1 from conversation_members m where m.conversation_id = c.id and m.user_id = p_other)
  limit 1;

  if conv_id is not null then return conv_id; end if;

  insert into conversations (kind, created_by) values ('dm', uid) returning id into conv_id;
  insert into conversation_members (conversation_id, user_id) values (conv_id, uid), (conv_id, p_other);
  return conv_id;
end;
$$;

create or replace function create_group_conversation(p_title text, p_member_ids uuid[])
returns uuid language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  conv_id uuid;
  member uuid;
begin
  if uid is null then raise exception 'not authenticated'; end if;
  if array_length(p_member_ids, 1) is null or array_length(p_member_ids, 1) < 1 then
    raise exception 'at least one other member required';
  end if;

  insert into conversations (kind, title, created_by)
    values ('group', nullif(btrim(p_title), ''), uid)
    returning id into conv_id;

  insert into conversation_members (conversation_id, user_id) values (conv_id, uid);
  foreach member in array p_member_ids loop
    if member <> uid then
      insert into conversation_members (conversation_id, user_id) values (conv_id, member)
        on conflict do nothing;
    end if;
  end loop;

  return conv_id;
end;
$$;

create or replace function mark_conversation_read(p_conversation_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then return; end if;
  update conversation_members
    set last_read_at = now()
    where conversation_id = p_conversation_id and user_id = uid;
end;
$$;

-- =========================================================================
-- Stream lifecycle helper — called by the Livepeer webhook route
-- (service role; does NOT use auth.uid()).
-- =========================================================================
create or replace function mark_stream_live(p_livepeer_stream_id text)
returns void language sql security definer set search_path = public as $$
  update streams
    set status = 'live', started_at = now()
    where livepeer_stream_id = p_livepeer_stream_id;
$$;

create or replace function mark_stream_ended(p_livepeer_stream_id text)
returns void language sql security definer set search_path = public as $$
  update streams
    set status = 'ended', ended_at = now()
    where livepeer_stream_id = p_livepeer_stream_id;
$$;

-- =========================================================================
-- Conversations: allow self-insert into conversation_members (for
-- owner joining on create; RPCs already handle this, but policy needs to
-- permit service-role-less inserts on membership too).
-- =========================================================================
create policy conversation_members_self_insert on conversation_members
  for insert with check (auth.uid() = user_id);
