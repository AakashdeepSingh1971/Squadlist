-- Squadlist: run once in Supabase -> SQL Editor -> New query -> paste -> Run.
-- Safe to run again; it updates things in place.
--
-- No accounts. A room's code is its key (made from room name + passcode, or
-- random). The app can't touch the tables directly, only the functions below,
-- one room at a time, so nobody can list rooms.

create extension if not exists pgcrypto;

-- People in a room (up to 10)
create table if not exists public.sl_members (
  id uuid primary key default gen_random_uuid(),
  room text not null check (room ~ '^[a-z0-9]{6,40}$'),
  name text not null check (char_length(name) between 1 and 24),
  emoji text not null default '🙂',
  color text not null default '#f97316',
  created_at timestamptz not null default now()
);
create index if not exists sl_members_room on public.sl_members (room);

-- Tasks. repeat = weekdays (0 = Sunday) for repeating tasks, null for one-off.
create table if not exists public.sl_tasks (
  id uuid primary key default gen_random_uuid(),
  room text not null,
  title text not null check (char_length(title) between 1 and 120),
  created_by uuid not null,
  assigned_to uuid not null,
  repeat smallint[],
  due date,
  created_day date not null,
  deleted_day date,
  created_at timestamptz not null default now()
);
create index if not exists sl_tasks_room on public.sl_tasks (room);

-- A tick: who finished which task on which day
create table if not exists public.sl_done (
  task_id uuid not null references public.sl_tasks (id) on delete cascade,
  room text not null,
  member uuid not null,
  day date not null,
  created_at timestamptz not null default now(),
  primary key (task_id, day)
);
create index if not exists sl_done_room on public.sl_done (room, day);

-- The feed: nudges and reactions (adds and ticks are read from the tables above)
create table if not exists public.sl_events (
  id uuid primary key default gen_random_uuid(),
  room text not null,
  kind text not null check (kind in ('nudge', 'react')),
  task_id uuid references public.sl_tasks (id) on delete cascade,
  from_member uuid not null,
  to_member uuid,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists sl_events_room on public.sl_events (room, created_at);

alter table public.sl_members enable row level security;
alter table public.sl_tasks   enable row level security;
alter table public.sl_done    enable row level security;
alter table public.sl_events  enable row level security;
revoke all on public.sl_members, public.sl_tasks, public.sl_done, public.sl_events from anon, authenticated;

create or replace function public.sl_check_room(p_room text) returns void
language plpgsql immutable as $$
begin
  if p_room !~ '^[a-z0-9]{6,40}$' then raise exception 'bad room code'; end if;
end; $$;

-- Everything a phone needs to open a room
create or replace function public.sl_load(p_room text)
returns jsonb language sql security definer set search_path = public stable as $$
  select jsonb_build_object(
    'members', coalesce((select jsonb_agg(m order by m.created_at) from sl_members m where m.room = p_room), '[]'),
    'tasks',   coalesce((select jsonb_agg(t order by t.created_at) from sl_tasks t
                         where t.room = p_room and (t.deleted_day is null or t.deleted_day > current_date - 400)), '[]'),
    'done',    coalesce((select jsonb_agg(jsonb_build_object('task_id', d.task_id, 'member', d.member, 'day', d.day, 'created_at', d.created_at))
                         from sl_done d where d.room = p_room and d.day > current_date - 400), '[]'),
    'events',  coalesce((select jsonb_agg(e order by e.created_at) from (
                         select * from sl_events where room = p_room order by created_at desc limit 300) e), '[]')
  );
$$;

create or replace function public.sl_join(p_room text, p_name text, p_emoji text, p_color text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare r sl_members;
begin
  perform sl_check_room(p_room);
  perform pg_advisory_xact_lock(hashtext(p_room));
  if (select count(*) from sl_members where room = p_room) >= 10 then raise exception 'room is full'; end if;
  insert into sl_members (room, name, emoji, color)
  values (p_room, left(trim(p_name), 24), left(p_emoji, 8), left(p_color, 16))
  returning * into r;
  return to_jsonb(r);
end; $$;

create or replace function public.sl_update_member(p_room text, p_id uuid, p_name text, p_emoji text, p_color text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare r sl_members;
begin
  update sl_members set name = left(trim(p_name), 24), emoji = left(p_emoji, 8), color = left(p_color, 16)
  where id = p_id and room = p_room returning * into r;
  return to_jsonb(r);
end; $$;

create or replace function public.sl_add_task(p_room text, p_title text, p_by uuid, p_to uuid,
  p_repeat smallint[], p_due date, p_today date)
returns jsonb language plpgsql security definer set search_path = public as $$
declare r sl_tasks;
begin
  perform sl_check_room(p_room);
  if not exists (select 1 from sl_members where id = p_by and room = p_room)
     or not exists (select 1 from sl_members where id = p_to and room = p_room) then
    raise exception 'not in this room';
  end if;
  if (select count(*) from sl_tasks where room = p_room and deleted_day is null) >= 500 then
    raise exception 'too many tasks';
  end if;
  insert into sl_tasks (room, title, created_by, assigned_to, repeat, due, created_day)
  values (p_room, left(trim(p_title), 120), p_by, p_to, nullif(p_repeat, '{}'), p_due, p_today)
  returning * into r;
  return to_jsonb(r);
end; $$;

-- Only whoever added a task can remove it. Repeating tasks keep their history
-- (so old streaks stay right); one-off tasks are deleted.
create or replace function public.sl_remove_task(p_room text, p_id uuid, p_by uuid, p_today date)
returns jsonb language plpgsql security definer set search_path = public as $$
declare r sl_tasks;
begin
  select * into r from sl_tasks where id = p_id and room = p_room;
  if r.id is null then return null; end if;
  if r.created_by <> p_by then raise exception 'only the person who added it can remove it'; end if;
  if r.repeat is null then
    delete from sl_tasks where id = p_id;
    r.deleted_day := p_today;
  else
    update sl_tasks set deleted_day = p_today where id = p_id returning * into r;
  end if;
  return to_jsonb(r);
end; $$;

create or replace function public.sl_set_done(p_room text, p_task uuid, p_member uuid, p_day date, p_done boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from sl_tasks where id = p_task and room = p_room and assigned_to = p_member) then
    raise exception 'only the person it is for can tick it';
  end if;
  if p_done then
    insert into sl_done (task_id, room, member, day) values (p_task, p_room, p_member, p_day)
    on conflict (task_id, day) do nothing;
  else
    delete from sl_done where task_id = p_task and day = p_day;
  end if;
end; $$;

create or replace function public.sl_add_event(p_room text, p_kind text, p_task uuid, p_from uuid, p_to uuid, p_data jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare r sl_events;
begin
  perform sl_check_room(p_room);
  if pg_column_size(p_data) > 500 then raise exception 'too large'; end if;
  if not exists (select 1 from sl_members where id = p_from and room = p_room) then raise exception 'not in this room'; end if;
  -- a reaction replaces your earlier one on the same tick
  if p_kind = 'react' then
    delete from sl_events where room = p_room and kind = 'react' and task_id = p_task
      and from_member = p_from and data->>'day' = p_data->>'day';
    if coalesce(p_data->>'emoji', '') = '' then return null; end if;
  end if;
  insert into sl_events (room, kind, task_id, from_member, to_member, data)
  values (p_room, p_kind, p_task, p_from, p_to, p_data) returning * into r;
  -- keep the feed small
  delete from sl_events where room = p_room and created_at < now() - interval '120 days';
  return to_jsonb(r);
end; $$;

do $$
declare f text;
begin
  foreach f in array array[
    'sl_load(text)', 'sl_join(text,text,text,text)', 'sl_update_member(text,uuid,text,text,text)',
    'sl_add_task(text,text,uuid,uuid,smallint[],date,date)', 'sl_remove_task(text,uuid,uuid,date)',
    'sl_set_done(text,uuid,uuid,date,boolean)', 'sl_add_event(text,text,uuid,uuid,uuid,jsonb)'
  ] loop
    execute format('revoke all on function public.%s from public', f);
    execute format('grant execute on function public.%s to anon, authenticated', f);
  end loop;
end $$;

-- Live updates travel over each room's realtime channel (broadcast), so the
-- tables don't need to be in the realtime publication.

-- =====================================================================
-- v2: photo proof, comments, streak freezes, challenges, push, admin
-- =====================================================================

alter table public.sl_tasks add column if not exists needs_proof boolean not null default false;
alter table public.sl_done  add column if not exists photo text;
alter table public.sl_done  add column if not exists photo_bytes int;

create table if not exists public.sl_comments (
  id uuid primary key default gen_random_uuid(),
  room text not null,
  task_id uuid not null references public.sl_tasks (id) on delete cascade,
  member uuid not null,
  body text not null check (char_length(body) between 1 and 500),
  created_at timestamptz not null default now()
);
create index if not exists sl_comments_room on public.sl_comments (room, created_at);

-- a freeze used on a day counts that day as done for that person
create table if not exists public.sl_freezes (
  room text not null,
  member uuid not null,
  day date not null,
  created_at timestamptz not null default now(),
  primary key (member, day)
);
create index if not exists sl_freezes_room on public.sl_freezes (room);

create table if not exists public.sl_challenges (
  id uuid primary key default gen_random_uuid(),
  room text not null,
  title text not null check (char_length(title) between 1 and 80),
  emoji text not null default '🏆',
  goal int not null check (goal between 1 and 365),
  ends date,
  created_by uuid not null,
  created_at timestamptz not null default now()
);
create index if not exists sl_challenges_room on public.sl_challenges (room);

create table if not exists public.sl_checkins (
  challenge_id uuid not null references public.sl_challenges (id) on delete cascade,
  room text not null,
  member uuid not null,
  day date not null,
  created_at timestamptz not null default now(),
  primary key (challenge_id, member, day)
);
create index if not exists sl_checkins_room on public.sl_checkins (room);

-- phones that want notifications
create table if not exists public.sl_push (
  endpoint text primary key,
  room text not null,
  member uuid not null,
  sub jsonb not null,
  tz text not null default 'UTC',
  remind_hour smallint check (remind_hour between 0 and 23),   -- null = no daily reminder
  last_reminded date,
  created_at timestamptz not null default now()
);
create index if not exists sl_push_member on public.sl_push (member);

alter table public.sl_comments   enable row level security;
alter table public.sl_freezes    enable row level security;
alter table public.sl_challenges enable row level security;
alter table public.sl_checkins   enable row level security;
alter table public.sl_push       enable row level security;
revoke all on public.sl_comments, public.sl_freezes, public.sl_challenges, public.sl_checkins, public.sl_push from anon, authenticated;

create or replace function public.sl_in_room(p_room text, p_member uuid) returns void
language plpgsql stable security definer set search_path = public as $$
begin
  perform sl_check_room(p_room);
  if not exists (select 1 from sl_members where id = p_member and room = p_room) then raise exception 'not in this room'; end if;
end; $$;

-- everything a phone needs, v2
create or replace function public.sl_load(p_room text)
returns jsonb language sql security definer set search_path = public stable as $$
  select jsonb_build_object(
    'members', coalesce((select jsonb_agg(m order by m.created_at) from sl_members m where m.room = p_room), '[]'),
    'tasks',   coalesce((select jsonb_agg(t order by t.created_at) from sl_tasks t
                         where t.room = p_room and (t.deleted_day is null or t.deleted_day > current_date - 400)), '[]'),
    'done',    coalesce((select jsonb_agg(jsonb_build_object('task_id', d.task_id, 'member', d.member, 'day', d.day,
                           'created_at', d.created_at, 'photo', d.photo, 'photo_bytes', d.photo_bytes))
                         from sl_done d where d.room = p_room and d.day > current_date - 400), '[]'),
    'events',  coalesce((select jsonb_agg(e order by e.created_at) from (
                         select * from sl_events where room = p_room order by created_at desc limit 300) e), '[]'),
    'comments', coalesce((select jsonb_agg(c order by c.created_at) from sl_comments c
                         where c.room = p_room and c.created_at > now() - interval '120 days'), '[]'),
    'freezes', coalesce((select jsonb_agg(jsonb_build_object('member', f.member, 'day', f.day)) from sl_freezes f where f.room = p_room), '[]'),
    'challenges', coalesce((select jsonb_agg(c order by c.created_at) from sl_challenges c where c.room = p_room), '[]'),
    'checkins', coalesce((select jsonb_agg(jsonb_build_object('challenge_id', k.challenge_id, 'member', k.member, 'day', k.day, 'created_at', k.created_at))
                         from sl_checkins k where k.room = p_room), '[]')
  );
$$;

drop function if exists public.sl_add_task(text, text, uuid, uuid, smallint[], date, date);
create or replace function public.sl_add_task(p_room text, p_title text, p_by uuid, p_to uuid,
  p_repeat smallint[], p_due date, p_today date, p_needs_proof boolean default false)
returns jsonb language plpgsql security definer set search_path = public as $$
declare r sl_tasks;
begin
  perform sl_in_room(p_room, p_by);
  perform sl_in_room(p_room, p_to);
  if (select count(*) from sl_tasks where room = p_room and deleted_day is null) >= 500 then
    raise exception 'too many tasks';
  end if;
  insert into sl_tasks (room, title, created_by, assigned_to, repeat, due, created_day, needs_proof)
  values (p_room, left(trim(p_title), 120), p_by, p_to, nullif(p_repeat, '{}'), p_due, p_today, coalesce(p_needs_proof, false))
  returning * into r;
  return to_jsonb(r);
end; $$;

-- whoever added a task can ask for (or stop asking for) a photo
create or replace function public.sl_set_needs_proof(p_room text, p_id uuid, p_by uuid, p_on boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare r sl_tasks;
begin
  update sl_tasks set needs_proof = p_on where id = p_id and room = p_room and created_by = p_by returning * into r;
  if r.id is null then raise exception 'only the person who added it can change that'; end if;
  return to_jsonb(r);
end; $$;

create or replace function public.sl_set_photo(p_room text, p_task uuid, p_member uuid, p_day date, p_photo text, p_bytes int)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_photo is not null and p_photo !~ '^https://[a-z0-9.-]+/storage/v1/object/public/proofs/' then raise exception 'bad photo link'; end if;
  update sl_done set photo = p_photo, photo_bytes = least(greatest(p_bytes, 0), 5000000)
  where task_id = p_task and day = p_day and member = p_member and room = p_room;
  if not found then raise exception 'tick it first'; end if;
end; $$;

create or replace function public.sl_add_comment(p_room text, p_task uuid, p_member uuid, p_body text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare r sl_comments;
begin
  perform sl_in_room(p_room, p_member);
  if not exists (select 1 from sl_tasks where id = p_task and room = p_room) then raise exception 'no such task'; end if;
  if (select count(*) from sl_comments where room = p_room and created_at > now() - interval '1 day') >= 2000 then
    raise exception 'slow down';
  end if;
  insert into sl_comments (room, task_id, member, body) values (p_room, p_task, p_member, left(trim(p_body), 500))
  returning * into r;
  return to_jsonb(r);
end; $$;

create or replace function public.sl_delete_comment(p_room text, p_id uuid, p_member uuid)
returns void language sql security definer set search_path = public as $$
  delete from sl_comments where id = p_id and room = p_room and member = p_member;
$$;

-- Freezes: the app works out how many you've earned (one per 7 streak days,
-- two at most). The database only allows saving one of the last two days,
-- and at most two freezes in any 14 days.
create or replace function public.sl_use_freeze(p_room text, p_member uuid, p_day date)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform sl_in_room(p_room, p_member);
  if p_day not between current_date - 2 and current_date then raise exception 'only yesterday can be saved'; end if;
  if (select count(*) from sl_freezes where member = p_member and day > p_day - 14) >= 2 then
    raise exception 'no freezes left';
  end if;
  insert into sl_freezes (room, member, day) values (p_room, p_member, p_day) on conflict do nothing;
end; $$;

create or replace function public.sl_add_challenge(p_room text, p_by uuid, p_title text, p_emoji text, p_goal int, p_ends date)
returns jsonb language plpgsql security definer set search_path = public as $$
declare r sl_challenges;
begin
  perform sl_in_room(p_room, p_by);
  if (select count(*) from sl_challenges where room = p_room) >= 100 then raise exception 'too many challenges'; end if;
  insert into sl_challenges (room, title, emoji, goal, ends, created_by)
  values (p_room, left(trim(p_title), 80), left(p_emoji, 8), p_goal, p_ends, p_by) returning * into r;
  return to_jsonb(r);
end; $$;

create or replace function public.sl_remove_challenge(p_room text, p_id uuid, p_by uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  delete from sl_challenges where id = p_id and room = p_room and created_by = p_by;
  if not found then raise exception 'only the person who started it can remove it'; end if;
end; $$;

create or replace function public.sl_checkin(p_room text, p_challenge uuid, p_member uuid, p_day date, p_on boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare r sl_checkins;
begin
  perform sl_in_room(p_room, p_member);
  if p_day not between current_date - 1 and current_date + 1 then raise exception 'only today'; end if;
  if not exists (select 1 from sl_challenges where id = p_challenge and room = p_room and (ends is null or ends >= p_day)) then
    raise exception 'this challenge is over';
  end if;
  if p_on then
    insert into sl_checkins (challenge_id, room, member, day) values (p_challenge, p_room, p_member, p_day)
    on conflict do nothing returning * into r;
    return to_jsonb(r);
  end if;
  delete from sl_checkins where challenge_id = p_challenge and member = p_member and day = p_day;
  return null;
end; $$;

create or replace function public.sl_save_push(p_room text, p_member uuid, p_sub jsonb, p_tz text, p_hour int)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform sl_in_room(p_room, p_member);
  if coalesce(p_sub->>'endpoint', '') !~ '^https://' or pg_column_size(p_sub) > 2000 then raise exception 'bad subscription'; end if;
  insert into sl_push (endpoint, room, member, sub, tz, remind_hour)
  values (p_sub->>'endpoint', p_room, p_member, p_sub, left(coalesce(p_tz, 'UTC'), 60), p_hour)
  on conflict (endpoint) do update set room = excluded.room, member = excluded.member, sub = excluded.sub,
    tz = excluded.tz, remind_hour = excluded.remind_hour;
end; $$;

create or replace function public.sl_delete_push(p_endpoint text)
returns void language sql security definer set search_path = public as $$
  delete from sl_push where endpoint = p_endpoint;
$$;

-- Photo proofs: public so a photo opens from its link, but the bucket can't
-- be listed. 5 MB max (the app shrinks photos to ~200 KB before uploading).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('proofs', 'proofs', true, 5242880, array['image/jpeg', 'image/webp'])
on conflict (id) do nothing;
drop policy if exists "proofs upload" on storage.objects;
create policy "proofs upload" on storage.objects for insert to anon, authenticated with check (bucket_id = 'proofs');

-- =====================================================================
-- Usage, for the admin page: how much data each phone uses, per day.
-- Only sizes and counts, never what anyone writes. Kept for 90 days.
-- =====================================================================
create table if not exists public.sl_usage (
  cid text not null,              -- one phone/browser (random id, no account)
  day date not null,
  name text,
  device text,
  room text,
  bytes_sync bigint not null default 0,    -- live updates (realtime), estimate
  bytes_api bigint not null default 0,     -- loading and saving (database calls), estimate
  bytes_photo bigint not null default 0,   -- photo proofs uploaded + viewed
  bytes_app bigint not null default 0,     -- downloading the app itself (not from cache)
  msgs int not null default 0,             -- realtime messages sent + received
  calls int not null default 0,            -- database calls
  pushes int not null default 0,           -- notifications this phone asked to send
  last_seen timestamptz not null default now(),
  primary key (cid, day)
);
create index if not exists sl_usage_day on public.sl_usage (day);
alter table public.sl_usage enable row level security;
revoke all on public.sl_usage from anon, authenticated;

create or replace function public.sl_log_usage(p_cid text, p_day date, p_name text, p_device text, p_room text,
  p_sync bigint, p_api bigint, p_photo bigint, p_app bigint, p_msgs int, p_calls int, p_pushes int)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_cid !~ '^[A-Za-z0-9-]{8,80}$' then raise exception 'bad id'; end if;
  if p_day not between current_date - 2 and current_date + 2 then raise exception 'bad day'; end if;
  insert into sl_usage as u (cid, day, name, device, room, bytes_sync, bytes_api, bytes_photo, bytes_app, msgs, calls, pushes, last_seen)
  values (p_cid, p_day, left(p_name, 40), left(p_device, 60), left(p_room, 40),
    -- a minute's worth at most per report, so one bad phone can't blow up the totals
    least(greatest(p_sync, 0), 20000000), least(greatest(p_api, 0), 20000000),
    least(greatest(p_photo, 0), 100000000), least(greatest(p_app, 0), 20000000),
    least(greatest(p_msgs, 0), 5000), least(greatest(p_calls, 0), 2000), least(greatest(p_pushes, 0), 200), now())
  on conflict (cid, day) do update set
    name = coalesce(nullif(excluded.name, ''), u.name),
    device = excluded.device,
    room = coalesce(nullif(excluded.room, ''), u.room),
    bytes_sync = u.bytes_sync + excluded.bytes_sync,
    bytes_api = u.bytes_api + excluded.bytes_api,
    bytes_photo = u.bytes_photo + excluded.bytes_photo,
    bytes_app = u.bytes_app + excluded.bytes_app,
    msgs = u.msgs + excluded.msgs,
    calls = u.calls + excluded.calls,
    pushes = u.pushes + excluded.pushes,
    last_seen = now();
  if random() < 0.02 then delete from sl_usage where day < current_date - 90; end if;
end; $$;

-- The admin password: checked here, stored scrambled (bcrypt), slowed down
-- after a wrong guess, locked for 15 minutes after 5 in a row.
-- Set it once in the SQL editor:   select public.sl_set_admin_password('a long password only you know');
create extension if not exists pgcrypto with schema extensions;
create table if not exists public.sl_admin_secret (
  id int primary key default 1 check (id = 1),
  hash text not null,
  failed int not null default 0,
  locked_until timestamptz
);
alter table public.sl_admin_secret enable row level security;
revoke all on public.sl_admin_secret from anon, authenticated;

create or replace function public.sl_set_admin_password(p_password text)
returns text language plpgsql security definer set search_path = public, extensions as $$
begin
  if length(p_password) < 10 then raise exception 'Use at least 10 characters'; end if;
  insert into sl_admin_secret (id, hash) values (1, crypt(p_password, gen_salt('bf', 10)))
  on conflict (id) do update set hash = excluded.hash, failed = 0, locked_until = null;
  return 'Admin password set.';
end; $$;
revoke all on function public.sl_set_admin_password(text) from public, anon, authenticated;

create or replace function public.sl_admin_report(p_password text)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare s sl_admin_secret; out jsonb; month_start date := date_trunc('month', current_date)::date;
begin
  select * into s from sl_admin_secret where id = 1 for update;
  if s is null then return jsonb_build_object('error', 'no_password'); end if;
  if s.locked_until is not null and s.locked_until > now() then
    return jsonb_build_object('error', 'locked', 'until', s.locked_until);
  end if;
  if crypt(coalesce(p_password, ''), s.hash) <> s.hash then
    update sl_admin_secret set failed = failed + 1,
      locked_until = case when failed + 1 >= 5 then now() + interval '15 minutes' else null end where id = 1;
    perform pg_sleep(1);
    return jsonb_build_object('error', 'wrong');
  end if;
  update sl_admin_secret set failed = 0, locked_until = null where id = 1;
  delete from sl_usage where day < current_date - 90;

  select jsonb_build_object(
    'generated', now(),
    'month_start', month_start,
    'users', coalesce((
      select jsonb_agg(u order by u.bytes_30 desc) from (
        select cid,
          (array_agg(name order by day desc) filter (where name <> ''))[1] as name,
          (array_agg(device order by day desc))[1] as device,
          (array_agg(room order by day desc) filter (where room <> ''))[1] as room,
          max(last_seen) as last_seen,
          coalesce(sum(bytes_sync + bytes_api + bytes_photo + bytes_app) filter (where day = current_date), 0) as bytes_1,
          coalesce(sum(bytes_sync + bytes_api + bytes_photo + bytes_app) filter (where day > current_date - 7), 0) as bytes_7,
          coalesce(sum(bytes_sync + bytes_api + bytes_photo + bytes_app) filter (where day > current_date - 30), 0) as bytes_30,
          coalesce(sum(bytes_sync) filter (where day > current_date - 30), 0) as sync_30,
          coalesce(sum(bytes_api) filter (where day > current_date - 30), 0) as api_30,
          coalesce(sum(bytes_photo) filter (where day > current_date - 30), 0) as photo_30,
          coalesce(sum(bytes_app) filter (where day > current_date - 30), 0) as app_30,
          coalesce(sum(msgs) filter (where day > current_date - 30), 0) as msgs_30,
          count(*) filter (where day > current_date - 30) as days_active_30
        from sl_usage group by cid
      ) u), '[]'::jsonb),
    'daily', coalesce((
      select jsonb_agg(d order by d.day) from (
        select day, sum(bytes_sync) as sync, sum(bytes_api) as api, sum(bytes_photo) as photo, sum(bytes_app) as app,
          sum(msgs) as msgs, sum(calls) as calls, sum(pushes) as pushes, count(*) as users
        from sl_usage where day > current_date - 30 group by day
      ) d), '[]'::jsonb),
    'month', (select jsonb_build_object(
        'bytes', coalesce(sum(bytes_sync + bytes_api + bytes_photo + bytes_app), 0),
        'msgs', coalesce(sum(msgs), 0), 'calls', coalesce(sum(calls), 0), 'pushes', coalesce(sum(pushes), 0),
        'users', count(distinct cid))
      from sl_usage where day >= month_start),
    'rooms', coalesce((
      select jsonb_agg(r order by r.last_active desc nulls last) from (
        select m.room, count(*) as members,
          (select count(*) from sl_tasks t where t.room = m.room and t.deleted_day is null) as tasks,
          (select count(*) from sl_done d where d.room = m.room) as ticks,
          (select count(*) from sl_done d where d.room = m.room and d.photo is not null) as photos,
          (select max(d.created_at) from sl_done d where d.room = m.room) as last_active
        from sl_members m group by m.room limit 200
      ) r), '[]'::jsonb),
    'totals', jsonb_build_object(
      'rooms', (select count(distinct room) from sl_members),
      'members', (select count(*) from sl_members),
      'tasks', (select count(*) from sl_tasks),
      'ticks', (select count(*) from sl_done),
      'comments', (select count(*) from sl_comments),
      'push_phones', (select count(*) from sl_push),
      'photo_files', (select count(*) from storage.objects where bucket_id = 'proofs'),
      'photo_bytes', (select coalesce(sum((metadata->>'size')::bigint), 0) from storage.objects where bucket_id = 'proofs'),
      'db_bytes', pg_database_size(current_database())
    )
  ) into out;
  return out;
end; $$;

do $$
declare f text;
begin
  foreach f in array array[
    'sl_load(text)', 'sl_add_task(text,text,uuid,uuid,smallint[],date,date,boolean)',
    'sl_set_needs_proof(text,uuid,uuid,boolean)', 'sl_set_photo(text,uuid,uuid,date,text,int)',
    'sl_add_comment(text,uuid,uuid,text)', 'sl_delete_comment(text,uuid,uuid)',
    'sl_use_freeze(text,uuid,date)', 'sl_add_challenge(text,uuid,text,text,int,date)',
    'sl_remove_challenge(text,uuid,uuid)', 'sl_checkin(text,uuid,uuid,date,boolean)',
    'sl_save_push(text,uuid,jsonb,text,int)', 'sl_delete_push(text)',
    'sl_log_usage(text,date,text,text,text,bigint,bigint,bigint,bigint,int,int,int)', 'sl_admin_report(text)'
  ] loop
    execute format('revoke all on function public.%s from public', f);
    execute format('grant execute on function public.%s to anon, authenticated', f);
  end loop;
  revoke all on function public.sl_in_room(text, uuid) from public, anon, authenticated;
end $$;

-- each notification is sent once, even if the app asks twice
create table if not exists public.sl_push_log (
  key text primary key,
  at timestamptz not null default now()
);
alter table public.sl_push_log enable row level security;
revoke all on public.sl_push_log from anon, authenticated;
