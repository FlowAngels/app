-- Safe read interfaces and row-level policies for authenticated anonymous users.
-- Apply only as part of the coordinated Auth + client feature-flag cutover.

begin;

create or replace function private.is_room_member(p_room_id text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select auth.uid() is not null and (
    exists (
      select 1 from public.rooms r
      where r.id = p_room_id and r.host_user_id = auth.uid()
    )
    or exists (
      select 1 from public.players p
      where p.room_id = p_room_id and p.user_id = auth.uid()
    )
  )
$$;

create or replace function public.whatever_room_preview(p_room_id text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_room public.rooms;
  v_avatars jsonb;
begin
  perform private.require_user();
  select * into v_room from public.rooms where id = upper(p_room_id);
  if not found then raise exception 'Room not found'; end if;
  select coalesce(jsonb_agg(avatar order by created_at), '[]'::jsonb)
  into v_avatars
  from public.players
  where room_id = v_room.id and connected;
  return jsonb_build_object(
    'id', v_room.id,
    'status', v_room.status,
    'avatars', v_avatars,
    'playerCount', jsonb_array_length(v_avatars)
  );
end;
$$;

create or replace function public.whatever_submission_progress(p_round_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_room_id text;
  v_player_ids jsonb;
begin
  perform private.require_user();
  select room_id into v_room_id from public.rounds where id = p_round_id;
  if not found then raise exception 'Round not found'; end if;
  if not private.is_room_member(v_room_id) then
    raise exception 'Room access required' using errcode = '42501';
  end if;
  select coalesce(jsonb_agg(player_id order by created_at), '[]'::jsonb)
  into v_player_ids
  from public.submissions
  where round_id = p_round_id;
  return jsonb_build_object(
    'count', jsonb_array_length(v_player_ids),
    'playerIds', v_player_ids
  );
end;
$$;

create or replace function public.whatever_reveal_items(p_round_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_round public.rounds;
  v_items jsonb;
begin
  perform private.require_user();
  select * into v_round from public.rounds where id = p_round_id;
  if not found then raise exception 'Round not found'; end if;
  if not private.is_room_member(v_round.room_id) then
    raise exception 'Room access required' using errcode = '42501';
  end if;
  if v_round.phase not in ('guessing', 'results') then
    raise exception 'Answers have not been revealed';
  end if;
  select coalesce(
    jsonb_agg(jsonb_build_object('id', s.id, 'text', s.text) order by item.ordinality),
    '[]'::jsonb
  )
  into v_items
  from jsonb_array_elements_text(v_round.reveal_order) with ordinality item(answer_id, ordinality)
  join public.submissions s on s.id = item.answer_id::uuid and s.round_id = p_round_id;
  return v_items;
end;
$$;

revoke all on function public.whatever_room_preview(text) from public, anon;
revoke all on function public.whatever_submission_progress(uuid) from public, anon;
revoke all on function public.whatever_reveal_items(uuid) from public, anon;
grant execute on function public.whatever_room_preview(text) to authenticated;
grant execute on function public.whatever_submission_progress(uuid) to authenticated;
grant execute on function public.whatever_reveal_items(uuid) to authenticated;

alter table public.rooms enable row level security;
alter table public.players enable row level security;
alter table public.rounds enable row level security;
alter table public.submissions enable row level security;
alter table public.guesses enable row level security;
alter table public.votes enable row level security;

drop policy if exists rooms_member_read on public.rooms;
create policy rooms_member_read on public.rooms for select to authenticated
using (private.is_room_member(id));

drop policy if exists players_member_read on public.players;
create policy players_member_read on public.players for select to authenticated
using (private.is_room_member(room_id));

drop policy if exists rounds_member_read on public.rounds;
create policy rounds_member_read on public.rounds for select to authenticated
using (private.is_room_member(room_id));

drop policy if exists submissions_own_read on public.submissions;
create policy submissions_own_read on public.submissions for select to authenticated
using (
  exists (
    select 1 from public.players p
    where p.id = player_id and p.user_id = auth.uid()
  )
);

drop policy if exists guesses_own_read on public.guesses;
create policy guesses_own_read on public.guesses for select to authenticated
using (
  exists (
    select 1 from public.players p
    where p.id = player_id and p.user_id = auth.uid()
  )
);

drop policy if exists votes_own_read on public.votes;
create policy votes_own_read on public.votes for select to authenticated
using (
  exists (
    select 1 from public.players p
    where p.id = player_id and p.user_id = auth.uid()
  )
);

grant select on public.rooms, public.players, public.rounds,
  public.submissions, public.guesses, public.votes to authenticated;
revoke insert, update, delete on public.rooms, public.players, public.rounds,
  public.submissions, public.guesses, public.votes from authenticated, anon;

commit;
