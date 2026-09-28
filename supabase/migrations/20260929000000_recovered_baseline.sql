-- Reconstructed from docs/whatever_mvp_build_plan_supabase.md and the client
-- queries recovered on 2026-09-29. The old hosted project's API key no longer
-- authenticates, so reconcile this migration against the live project before
-- linking or deploying it.

create extension if not exists pgcrypto;

create table if not exists public.rooms (
  id text primary key,
  status text not null default 'lobby'
    check (status in ('lobby', 'inRound', 'results', 'ended')),
  host_device_id text not null,
  category_pool jsonb not null default '[]'::jsonb,
  round_index integer not null default 0 check (round_index >= 0),
  total_rounds integer not null default 8 check (total_rounds > 0),
  leaderboards jsonb not null default '{"chameleon": {}, "crowd": {}}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.players (
  id uuid primary key default gen_random_uuid(),
  room_id text not null references public.rooms(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 20),
  avatar text not null,
  connected boolean not null default true,
  selected_categories jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.rounds (
  id uuid primary key default gen_random_uuid(),
  room_id text not null references public.rooms(id) on delete cascade,
  owner_id uuid references public.players(id),
  category text not null,
  prompt jsonb not null,
  deadline timestamptz,
  reveal_order jsonb not null default '[]'::jsonb,
  results jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.submissions (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null references public.rounds(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  text text not null check (char_length(btrim(text)) between 1 and 100),
  created_at timestamptz not null default now(),
  unique (round_id, player_id)
);

create table if not exists public.guesses (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null references public.rounds(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  answer_id uuid not null references public.submissions(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (round_id, player_id)
);

create table if not exists public.votes (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null references public.rounds(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  answer_id uuid not null references public.submissions(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (round_id, player_id)
);

create index if not exists players_room_id_idx on public.players(room_id);
create index if not exists rounds_room_created_idx on public.rounds(room_id, created_at desc);
create index if not exists submissions_round_id_idx on public.submissions(round_id);
create index if not exists guesses_round_id_idx on public.guesses(round_id);
create index if not exists votes_round_id_idx on public.votes(round_id);

-- The recovered browser client performs direct table writes. RLS is therefore
-- intentionally not enabled by this fidelity migration. Do not expose this
-- schema publicly until authoritative RPC/Edge Function boundaries and RLS
-- policies replace those writes.
