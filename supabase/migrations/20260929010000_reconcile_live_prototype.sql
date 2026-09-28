-- Reconcile the populated 2025 prototype with the verified local baseline.
-- This migration is intentionally data-aware and preserves a database-side
-- snapshot before tightening constraints. Review LIVE_AUDIT_2026-09-29.md.

begin;

create schema if not exists archive;
revoke all on schema archive from anon, authenticated;

create table if not exists archive.whatever_20260929_rooms
  (like public.rooms including all);
create table if not exists archive.whatever_20260929_players
  (like public.players including all);
create table if not exists archive.whatever_20260929_rounds
  (like public.rounds including all);
create table if not exists archive.whatever_20260929_submissions
  (like public.submissions including all);
create table if not exists archive.whatever_20260929_guesses
  (like public.guesses including all);
create table if not exists archive.whatever_20260929_votes
  (like public.votes including all);

insert into archive.whatever_20260929_rooms select * from public.rooms
on conflict do nothing;
insert into archive.whatever_20260929_players select * from public.players
on conflict do nothing;
insert into archive.whatever_20260929_rounds select * from public.rounds
on conflict do nothing;
insert into archive.whatever_20260929_submissions select * from public.submissions
on conflict do nothing;
insert into archive.whatever_20260929_guesses select * from public.guesses
on conflict do nothing;
insert into archive.whatever_20260929_votes select * from public.votes
on conflict do nothing;

alter table public.rooms
  add column if not exists host_user_id uuid references auth.users(id) on delete set null;

alter table public.players
  add column if not exists user_id uuid references auth.users(id) on delete set null,
  add column if not exists created_at timestamptz default now();

alter table public.rounds
  add column if not exists phase text default 'prompt',
  add column if not exists vote_deadline timestamptz,
  add column if not exists finalized_at timestamptz;

alter table public.submissions
  add column if not exists created_at timestamptz default now();
alter table public.guesses
  add column if not exists created_at timestamptz default now();
alter table public.votes
  add column if not exists created_at timestamptz default now();

update public.rooms set category_pool = '[]'::jsonb where category_pool is null;
update public.rooms
set leaderboards = '{"chameleon": {}, "crowd": {}}'::jsonb
where leaderboards is null;
update public.rooms set created_at = now() where created_at is null;
update public.players set selected_categories = '[]'::jsonb
where selected_categories is null;
update public.players set created_at = now() where created_at is null;
update public.rounds set reveal_order = '[]'::jsonb where reveal_order is null;
update public.rounds set created_at = now() where created_at is null;
update public.rounds set phase = 'responding' where phase is null;
update public.submissions set created_at = now() where created_at is null;
update public.guesses set created_at = now() where created_at is null;
update public.votes set created_at = now() where created_at is null;

-- The live prototype contains one duplicate player/round submission pair and
-- has no submission timestamps. Preserve every row in archive, then retain one
-- deterministic row per pair in the active game tables.
delete from public.submissions
where id in (
  select id
  from (
    select
      id,
      row_number() over (partition by round_id, player_id order by id) as ordinal
    from public.submissions
  ) duplicates
  where duplicates.ordinal > 1
);

alter table public.rooms
  alter column category_pool set not null,
  alter column leaderboards set not null,
  alter column created_at set not null;
alter table public.players
  alter column room_id set not null,
  alter column selected_categories set not null,
  alter column created_at set not null;
alter table public.rounds
  alter column room_id set not null,
  alter column deadline drop not null,
  alter column reveal_order set not null,
  alter column created_at set not null,
  alter column phase set not null;
alter table public.submissions
  alter column round_id set not null,
  alter column player_id set not null,
  alter column created_at set not null;
alter table public.guesses
  alter column round_id set not null,
  alter column player_id set not null,
  alter column answer_id set not null,
  alter column created_at set not null;
alter table public.votes
  alter column round_id set not null,
  alter column player_id set not null,
  alter column answer_id set not null,
  alter column created_at set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'rooms_round_index_check'
      and conrelid = 'public.rooms'::regclass
  ) then
    alter table public.rooms add constraint rooms_round_index_check check (round_index >= 0);
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'rooms_total_rounds_check'
      and conrelid = 'public.rooms'::regclass
  ) then
    alter table public.rooms add constraint rooms_total_rounds_check check (total_rounds > 0);
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'players_name_nonblank_check'
      and conrelid = 'public.players'::regclass
  ) then
    alter table public.players add constraint players_name_nonblank_check
      check (char_length(btrim(name)) between 1 and 20);
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'rounds_phase_check'
      and conrelid = 'public.rounds'::regclass
  ) then
    alter table public.rounds add constraint rounds_phase_check
      check (phase in ('prompt', 'responding', 'guessing', 'results'));
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'submissions_text_nonempty_check'
      and conrelid = 'public.submissions'::regclass
  ) then
    alter table public.submissions add constraint submissions_text_nonempty_check
      check (char_length(btrim(text)) between 1 and 100);
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'submissions_round_player_key'
      and conrelid = 'public.submissions'::regclass
  ) then
    alter table public.submissions add constraint submissions_round_player_key
      unique (round_id, player_id);
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'guesses_round_player_key'
      and conrelid = 'public.guesses'::regclass
  ) then
    alter table public.guesses add constraint guesses_round_player_key
      unique (round_id, player_id);
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'votes_round_player_key'
      and conrelid = 'public.votes'::regclass
  ) then
    alter table public.votes add constraint votes_round_player_key
      unique (round_id, player_id);
  end if;
end $$;

create index if not exists players_room_id_idx on public.players(room_id);
create index if not exists players_user_id_idx on public.players(user_id);
create index if not exists rounds_room_created_idx
  on public.rounds(room_id, created_at desc);
create index if not exists submissions_round_id_idx on public.submissions(round_id);
create index if not exists guesses_round_id_idx on public.guesses(round_id);
create index if not exists votes_round_id_idx on public.votes(round_id);

commit;
