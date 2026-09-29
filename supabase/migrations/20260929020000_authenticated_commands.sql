-- Authenticated, transactional command boundary for the first playable slice.
-- This migration deliberately does not enable RLS yet: the recovered client
-- still contains direct reads and writes that must be migrated first.

begin;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create unique index if not exists players_room_user_key
  on public.players(room_id, user_id)
  where user_id is not null;
create unique index if not exists players_room_connected_avatar_key
  on public.players(room_id, avatar)
  where connected;

create or replace function private.require_user()
returns uuid
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;
  return v_user_id;
end;
$$;

create or replace function private.require_host(p_room_id text)
returns public.rooms
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_room public.rooms;
  v_user_id uuid := private.require_user();
begin
  select * into v_room from public.rooms where id = upper(p_room_id);
  if not found then
    raise exception 'Room not found';
  end if;
  if v_room.host_user_id is distinct from v_user_id then
    raise exception 'Host access required' using errcode = '42501';
  end if;
  return v_room;
end;
$$;

create or replace function public.whatever_create_room(p_host_device_id text)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_room_id text;
  v_user_id uuid := private.require_user();
  v_alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_attempt integer;
begin
  if char_length(btrim(coalesce(p_host_device_id, ''))) < 8 then
    raise exception 'Invalid host device';
  end if;

  for v_attempt in 1..20 loop
    v_room_id := '';
    for i in 1..4 loop
      v_room_id := v_room_id || substr(v_alphabet, 1 + floor(random() * char_length(v_alphabet))::integer, 1);
    end loop;
    begin
      insert into public.rooms (id, host_device_id, host_user_id, status)
      values (v_room_id, p_host_device_id, v_user_id, 'lobby');
      return v_room_id;
    exception when unique_violation then
      -- Try another short code.
    end;
  end loop;
  raise exception 'Could not generate unique room code';
end;
$$;

create or replace function public.whatever_join_room(
  p_room_id text,
  p_name text,
  p_avatar text
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_room public.rooms;
  v_player_id uuid;
  v_user_id uuid := private.require_user();
  v_name text := btrim(coalesce(p_name, ''));
begin
  if char_length(v_name) not between 1 and 20 then
    raise exception 'Name must be 1-20 characters';
  end if;
  if p_avatar not in ('🔴', '🔵', '🟢', '🟡', '🟣', '🟠', '🩷', '🩵') then
    raise exception 'Invalid avatar';
  end if;

  select * into v_room
  from public.rooms
  where id = upper(p_room_id)
  for update;
  if not found then
    raise exception 'Room not found';
  end if;
  if v_room.status <> 'lobby' then
    raise exception 'Room is not accepting new players';
  end if;

  select id into v_player_id
  from public.players
  where room_id = v_room.id and user_id = v_user_id;
  if found then
    update public.players
    set name = v_name, avatar = p_avatar, connected = true
    where id = v_player_id;
    return v_player_id;
  end if;

  if (select count(*) from public.players where room_id = v_room.id and connected) >= 8 then
    raise exception 'Room is full';
  end if;

  insert into public.players (room_id, user_id, name, avatar, connected)
  values (v_room.id, v_user_id, v_name, p_avatar, true)
  returning id into v_player_id;
  return v_player_id;
exception
  when unique_violation then
    raise exception 'That avatar is already taken';
end;
$$;

create or replace function public.whatever_set_categories(
  p_player_id uuid,
  p_categories text[]
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_room_id text;
  v_pool jsonb;
  v_user_id uuid := private.require_user();
begin
  if coalesce(cardinality(p_categories), 0) not between 1 and 3
     or exists (
       select 1 from unnest(p_categories) category
       where category is null
          or category not in ('headline_hijack', 'law_or_nah', 'meme_mash')
     )
     or (select count(distinct category) from unnest(p_categories) category)
        <> cardinality(p_categories)
  then
    raise exception 'Invalid category selection';
  end if;

  update public.players
  set selected_categories = to_jsonb(p_categories)
  where id = p_player_id and user_id = v_user_id
  returning room_id into v_room_id;
  if not found then
    raise exception 'Player access required' using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(category order by category), '[]'::jsonb)
  into v_pool
  from unnest(array['headline_hijack', 'law_or_nah', 'meme_mash']) category
  where not exists (
    select 1
    from public.players p
    where p.room_id = v_room_id
      and p.connected
      and not (p.selected_categories ? category)
  );

  update public.rooms set category_pool = v_pool where id = v_room_id;
  return v_pool;
end;
$$;

create or replace function public.whatever_set_connected(
  p_player_id uuid,
  p_connected boolean
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform private.require_user();
  update public.players
  set connected = p_connected
  where id = p_player_id and user_id = auth.uid();
  if not found then
    raise exception 'Player access required' using errcode = '42501';
  end if;
end;
$$;

create or replace function public.whatever_start_round(
  p_room_id text,
  p_category text,
  p_prompt_text text
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_room public.rooms;
  v_round_id uuid;
  v_owner_id uuid;
begin
  v_room := private.require_host(p_room_id);
  if p_category not in ('headline_hijack', 'law_or_nah', 'meme_mash') then
    raise exception 'Invalid category';
  end if;
  if char_length(btrim(coalesce(p_prompt_text, ''))) not between 1 and 500 then
    raise exception 'Invalid prompt';
  end if;
  if (select count(*) from public.players where room_id = v_room.id and connected) < 3 then
    raise exception 'At least three players are required';
  end if;

  select id into v_owner_id
  from public.players
  where room_id = v_room.id and connected
  order by created_at, id
  offset (v_room.round_index % (select count(*) from public.players where room_id = v_room.id and connected))
  limit 1;

  insert into public.rounds (room_id, owner_id, category, prompt, phase)
  values (v_room.id, v_owner_id, p_category, jsonb_build_object('text', btrim(p_prompt_text)), 'prompt')
  returning id into v_round_id;
  update public.rooms set status = 'inRound' where id = v_room.id;
  return v_round_id;
end;
$$;

create or replace function public.whatever_begin_round(p_round_id uuid)
returns timestamptz
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_room_id text;
  v_deadline timestamptz := now() + interval '60 seconds';
begin
  select room_id into v_room_id from public.rounds where id = p_round_id for update;
  if not found then raise exception 'Round not found'; end if;
  perform private.require_host(v_room_id);
  update public.rounds
  set phase = 'responding', deadline = v_deadline
  where id = p_round_id and phase = 'prompt';
  if not found then raise exception 'Round cannot begin from its current phase'; end if;
  return v_deadline;
end;
$$;

create or replace function public.whatever_submit_answer(p_round_id uuid, p_text text)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_round public.rounds;
  v_player_id uuid;
  v_submission_id uuid;
  v_text text := btrim(coalesce(p_text, ''));
begin
  perform private.require_user();
  if char_length(v_text) not between 1 and 100 then
    raise exception 'Answer must be 1-100 characters';
  end if;
  select * into v_round from public.rounds where id = p_round_id;
  if not found then raise exception 'Round not found'; end if;
  if v_round.phase <> 'responding' or v_round.deadline is null or now() > v_round.deadline then
    raise exception 'Answering is closed';
  end if;
  select id into v_player_id
  from public.players
  where room_id = v_round.room_id and user_id = auth.uid() and connected;
  if not found then raise exception 'Player access required' using errcode = '42501'; end if;

  insert into public.submissions (round_id, player_id, text)
  values (p_round_id, v_player_id, v_text)
  on conflict (round_id, player_id) do update set text = excluded.text
  returning id into v_submission_id;
  return v_submission_id;
end;
$$;

create or replace function public.whatever_reveal_round(p_round_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_room_id text;
  v_items jsonb;
begin
  select room_id into v_room_id from public.rounds where id = p_round_id for update;
  if not found then raise exception 'Round not found'; end if;
  perform private.require_host(v_room_id);

  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'text', text) order by random()), '[]'::jsonb)
  into v_items
  from public.submissions
  where round_id = p_round_id;
  if jsonb_array_length(v_items) < 3 then
    raise exception 'At least three answers are required';
  end if;

  update public.rounds
  set phase = 'guessing',
      reveal_order = (select jsonb_agg(item->>'id') from jsonb_array_elements(v_items) item),
      vote_deadline = now() + interval '30 seconds'
  where id = p_round_id and phase = 'responding';
  if not found then raise exception 'Round cannot reveal from its current phase'; end if;
  return v_items;
end;
$$;

create or replace function public.whatever_set_guess(p_round_id uuid, p_answer_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_round public.rounds;
  v_player_id uuid;
  v_answer_owner uuid;
begin
  perform private.require_user();
  select * into v_round from public.rounds where id = p_round_id;
  if not found or v_round.phase <> 'guessing' or now() > v_round.vote_deadline then
    raise exception 'Guessing is closed';
  end if;
  select id into v_player_id from public.players
  where room_id = v_round.room_id and user_id = auth.uid() and connected;
  if not found then raise exception 'Player access required' using errcode = '42501'; end if;
  select player_id into v_answer_owner from public.submissions
  where id = p_answer_id and round_id = p_round_id;
  if not found then raise exception 'Answer not found'; end if;
  if v_answer_owner = v_player_id then raise exception 'Cannot guess your own answer'; end if;

  insert into public.guesses (round_id, player_id, answer_id)
  values (p_round_id, v_player_id, p_answer_id)
  on conflict (round_id, player_id) do update set answer_id = excluded.answer_id;
end;
$$;

create or replace function public.whatever_set_vote(p_round_id uuid, p_answer_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_round public.rounds;
  v_player_id uuid;
  v_answer_owner uuid;
begin
  perform private.require_user();
  select * into v_round from public.rounds where id = p_round_id;
  if not found or v_round.phase <> 'guessing' or now() > v_round.vote_deadline then
    raise exception 'Voting is closed';
  end if;
  select id into v_player_id from public.players
  where room_id = v_round.room_id and user_id = auth.uid() and connected;
  if not found then raise exception 'Player access required' using errcode = '42501'; end if;
  select player_id into v_answer_owner from public.submissions
  where id = p_answer_id and round_id = p_round_id;
  if not found then raise exception 'Answer not found'; end if;
  if v_answer_owner = v_player_id then raise exception 'Cannot vote for your own answer'; end if;

  insert into public.votes (round_id, player_id, answer_id)
  values (p_round_id, v_player_id, p_answer_id)
  on conflict (round_id, player_id) do update set answer_id = excluded.answer_id;
end;
$$;

create or replace function public.whatever_finalize_round(p_round_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_round public.rounds;
  v_room public.rooms;
  v_owner_answer_id uuid;
  v_correct_guessers uuid[];
  v_eligible_guessers integer;
  v_owner_sweet_spot boolean;
  v_vote_counts jsonb;
  v_results jsonb;
  v_leaderboards jsonb;
  v_player_id uuid;
  v_points integer;
  v_vote record;
begin
  select * into v_round from public.rounds where id = p_round_id for update;
  if not found then raise exception 'Round not found'; end if;
  perform private.require_host(v_round.room_id);
  if v_round.finalized_at is not null then
    return v_round.results;
  end if;
  if v_round.phase <> 'guessing' then
    raise exception 'Round cannot finalize from its current phase';
  end if;
  if v_round.vote_deadline is not null and now() < v_round.vote_deadline then
    raise exception 'Voting is still open';
  end if;

  select * into v_room from public.rooms where id = v_round.room_id for update;
  select id into v_owner_answer_id
  from public.submissions
  where round_id = p_round_id and player_id = v_round.owner_id;

  select coalesce(array_agg(g.player_id order by g.player_id), '{}'::uuid[])
  into v_correct_guessers
  from public.guesses g
  where g.round_id = p_round_id
    and g.answer_id = v_owner_answer_id
    and g.player_id <> v_round.owner_id;

  select count(*) into v_eligible_guessers
  from public.players
  where room_id = v_round.room_id and connected and id <> v_round.owner_id;
  v_owner_sweet_spot := cardinality(v_correct_guessers) > 0
    and cardinality(v_correct_guessers) < v_eligible_guessers;

  select coalesce(jsonb_object_agg(answer_id::text, vote_count), '{}'::jsonb)
  into v_vote_counts
  from (
    select answer_id, count(*)::integer as vote_count
    from public.votes
    where round_id = p_round_id
    group by answer_id
  ) counts;

  v_leaderboards := coalesce(
    v_room.leaderboards,
    '{"chameleon": {}, "crowd": {}}'::jsonb
  );
  foreach v_player_id in array v_correct_guessers loop
    v_points := coalesce((v_leaderboards #>> array['chameleon', v_player_id::text])::integer, 0);
    v_leaderboards := jsonb_set(
      v_leaderboards,
      array['chameleon', v_player_id::text],
      to_jsonb(v_points + 2),
      true
    );
  end loop;
  if v_owner_sweet_spot then
    v_points := coalesce((v_leaderboards #>> array['chameleon', v_round.owner_id::text])::integer, 0);
    v_leaderboards := jsonb_set(
      v_leaderboards,
      array['chameleon', v_round.owner_id::text],
      to_jsonb(v_points + 3),
      true
    );
  end if;

  for v_vote in
    select s.player_id, count(v.id)::integer as vote_count
    from public.votes v
    join public.submissions s on s.id = v.answer_id
    where v.round_id = p_round_id
    group by s.player_id
  loop
    v_points := coalesce((v_leaderboards #>> array['crowd', v_vote.player_id::text])::integer, 0);
    v_leaderboards := jsonb_set(
      v_leaderboards,
      array['crowd', v_vote.player_id::text],
      to_jsonb(v_points + v_vote.vote_count),
      true
    );
  end loop;

  v_results := jsonb_build_object(
    'ownerAnswerId', v_owner_answer_id,
    'correctGuessers', to_jsonb(v_correct_guessers),
    'voteCounts', v_vote_counts,
    'ownerSweetSpot', v_owner_sweet_spot
  );
  update public.rounds
  set results = v_results, phase = 'results', finalized_at = now()
  where id = p_round_id;
  update public.rooms
  set leaderboards = v_leaderboards,
      status = 'results',
      round_index = round_index + 1
  where id = v_round.room_id;
  return v_results;
end;
$$;

revoke all on function public.whatever_create_room(text) from public, anon;
revoke all on function public.whatever_join_room(text, text, text) from public, anon;
revoke all on function public.whatever_set_categories(uuid, text[]) from public, anon;
revoke all on function public.whatever_set_connected(uuid, boolean) from public, anon;
revoke all on function public.whatever_start_round(text, text, text) from public, anon;
revoke all on function public.whatever_begin_round(uuid) from public, anon;
revoke all on function public.whatever_submit_answer(uuid, text) from public, anon;
revoke all on function public.whatever_reveal_round(uuid) from public, anon;
revoke all on function public.whatever_set_guess(uuid, uuid) from public, anon;
revoke all on function public.whatever_set_vote(uuid, uuid) from public, anon;
revoke all on function public.whatever_finalize_round(uuid) from public, anon;

grant execute on function public.whatever_create_room(text) to authenticated;
grant execute on function public.whatever_join_room(text, text, text) to authenticated;
grant execute on function public.whatever_set_categories(uuid, text[]) to authenticated;
grant execute on function public.whatever_set_connected(uuid, boolean) to authenticated;
grant execute on function public.whatever_start_round(text, text, text) to authenticated;
grant execute on function public.whatever_begin_round(uuid) to authenticated;
grant execute on function public.whatever_submit_answer(uuid, text) to authenticated;
grant execute on function public.whatever_reveal_round(uuid) to authenticated;
grant execute on function public.whatever_set_guess(uuid, uuid) to authenticated;
grant execute on function public.whatever_set_vote(uuid, uuid) to authenticated;
grant execute on function public.whatever_finalize_round(uuid) to authenticated;

commit;
