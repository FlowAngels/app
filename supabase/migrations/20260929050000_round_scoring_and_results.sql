-- Reward convincing decoys and persist enough post-reveal detail for each
-- player to understand the round outcome and their current standing.

begin;

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
  v_answer_owners jsonb;
  v_round_chameleon jsonb := '{}'::jsonb;
  v_round_crowd jsonb := '{}'::jsonb;
  v_results jsonb;
  v_leaderboards jsonb;
  v_player_id uuid;
  v_points integer;
  v_award record;
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

  select coalesce(jsonb_object_agg(s.id::text, s.player_id::text), '{}'::jsonb)
  into v_answer_owners
  from public.submissions s
  where s.round_id = p_round_id;

  v_leaderboards := coalesce(
    v_room.leaderboards,
    '{"chameleon": {}, "crowd": {}}'::jsonb
  );

  foreach v_player_id in array v_correct_guessers loop
    v_points := coalesce((v_leaderboards #>> array['chameleon', v_player_id::text])::integer, 0);
    v_leaderboards := jsonb_set(v_leaderboards, array['chameleon', v_player_id::text], to_jsonb(v_points + 2), true);
    v_round_chameleon := jsonb_set(
      v_round_chameleon,
      array[v_player_id::text],
      to_jsonb(coalesce((v_round_chameleon ->> v_player_id::text)::integer, 0) + 2),
      true
    );
  end loop;

  if v_owner_sweet_spot then
    v_points := coalesce((v_leaderboards #>> array['chameleon', v_round.owner_id::text])::integer, 0);
    v_leaderboards := jsonb_set(v_leaderboards, array['chameleon', v_round.owner_id::text], to_jsonb(v_points + 3), true);
    v_round_chameleon := jsonb_set(v_round_chameleon, array[v_round.owner_id::text], '3'::jsonb, true);
  end if;

  -- A decoy earns one Chameleon point whenever another eligible player
  -- mistakes it for the Round Owner's answer.
  for v_award in
    select s.player_id, count(g.id)::integer as point_count
    from public.guesses g
    join public.submissions s on s.id = g.answer_id and s.round_id = p_round_id
    where g.round_id = p_round_id
      and g.player_id <> v_round.owner_id
      and g.answer_id <> v_owner_answer_id
      and g.player_id <> s.player_id
    group by s.player_id
  loop
    v_points := coalesce((v_leaderboards #>> array['chameleon', v_award.player_id::text])::integer, 0);
    v_leaderboards := jsonb_set(
      v_leaderboards,
      array['chameleon', v_award.player_id::text],
      to_jsonb(v_points + v_award.point_count),
      true
    );
    v_round_chameleon := jsonb_set(
      v_round_chameleon,
      array[v_award.player_id::text],
      to_jsonb(coalesce((v_round_chameleon ->> v_award.player_id::text)::integer, 0) + v_award.point_count),
      true
    );
  end loop;

  for v_award in
    select s.player_id, count(v.id)::integer as point_count
    from public.votes v
    join public.submissions s on s.id = v.answer_id
    where v.round_id = p_round_id
    group by s.player_id
  loop
    v_points := coalesce((v_leaderboards #>> array['crowd', v_award.player_id::text])::integer, 0);
    v_leaderboards := jsonb_set(
      v_leaderboards,
      array['crowd', v_award.player_id::text],
      to_jsonb(v_points + v_award.point_count),
      true
    );
    v_round_crowd := jsonb_set(v_round_crowd, array[v_award.player_id::text], to_jsonb(v_award.point_count), true);
  end loop;

  v_results := jsonb_build_object(
    'ownerAnswerId', v_owner_answer_id,
    'correctGuessers', to_jsonb(v_correct_guessers),
    'voteCounts', v_vote_counts,
    'ownerSweetSpot', v_owner_sweet_spot,
    'answerOwners', v_answer_owners,
    'roundChameleon', v_round_chameleon,
    'roundCrowd', v_round_crowd
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

revoke all on function public.whatever_finalize_round(uuid) from public, anon;
grant execute on function public.whatever_finalize_round(uuid) to authenticated;

commit;
