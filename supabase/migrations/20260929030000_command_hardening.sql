-- Preserve the controller's ability to clear a favourite while using the
-- authenticated command boundary.

begin;

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

  if p_answer_id is null then
    delete from public.votes where round_id = p_round_id and player_id = v_player_id;
    return;
  end if;

  select player_id into v_answer_owner from public.submissions
  where id = p_answer_id and round_id = p_round_id;
  if not found then raise exception 'Answer not found'; end if;
  if v_answer_owner = v_player_id then raise exception 'Cannot vote for your own answer'; end if;

  insert into public.votes (round_id, player_id, answer_id)
  values (p_round_id, v_player_id, p_answer_id)
  on conflict (round_id, player_id) do update set answer_id = excluded.answer_id;
end;
$$;

revoke all on function public.whatever_set_vote(uuid, uuid) from public, anon;
grant execute on function public.whatever_set_vote(uuid, uuid) to authenticated;

commit;
