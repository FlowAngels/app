import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'

const baselineSource = await readFile(
  new URL('../supabase/migrations/20260929000000_recovered_baseline.sql', import.meta.url),
  'utf8',
)
// PGlite does not bundle pgcrypto, while Supabase does. PostgreSQL provides
// gen_random_uuid() directly, so omitting the extension is sufficient here.
const baseline = baselineSource.replace(/^create extension if not exists pgcrypto;$/m, '')
const reconciliation = await readFile(
  new URL('../supabase/migrations/20260929010000_reconcile_live_prototype.sql', import.meta.url),
  'utf8',
)

async function prepareAuthSchema(db) {
  await db.exec(`
    create role anon nologin;
    create role authenticated nologin;
    create schema auth;
    create table auth.users (id uuid primary key default gen_random_uuid());
  `)
}

async function verifyFreshInstall() {
  const db = new PGlite()
  await db.waitReady
  await prepareAuthSchema(db)
  await db.exec(baseline)
  await db.exec(reconciliation)

  const tables = await db.query(`
    select table_name
    from information_schema.tables
    where table_schema = 'public'
    order by table_name
  `)
  assert.deepEqual(
    tables.rows.map((row) => row.table_name),
    ['guesses', 'players', 'rooms', 'rounds', 'submissions', 'votes'],
  )

  const phaseColumn = await db.query(`
    select is_nullable
    from information_schema.columns
    where table_schema = 'public' and table_name = 'rounds' and column_name = 'phase'
  `)
  assert.equal(phaseColumn.rows[0]?.is_nullable, 'NO')
  await db.close()
}

async function verifyPopulatedPrototypeUpgrade() {
  const db = new PGlite()
  await db.waitReady
  await prepareAuthSchema(db)
  await db.exec(`
    create table public.rooms (
      id text primary key,
      status text not null default 'lobby',
      host_device_id text not null,
      category_pool jsonb default '[]'::jsonb,
      round_index integer not null default 0,
      total_rounds integer not null default 8,
      leaderboards jsonb default '{"crowd": {}, "chameleon": {}}'::jsonb,
      created_at timestamptz default now(),
      warned boolean default false
    );
    create table public.players (
      id uuid primary key default gen_random_uuid(),
      room_id text references public.rooms(id) on delete cascade,
      name text not null,
      avatar text not null,
      connected boolean not null default true,
      selected_categories jsonb default '[]'::jsonb,
      created_at timestamptz default now()
    );
    create table public.rounds (
      id uuid primary key default gen_random_uuid(),
      room_id text references public.rooms(id) on delete cascade,
      owner_id uuid references public.players(id),
      category text not null,
      prompt jsonb not null,
      deadline timestamptz not null,
      reveal_order jsonb default '[]'::jsonb,
      results jsonb,
      created_at timestamptz default now()
    );
    create table public.submissions (
      id uuid primary key default gen_random_uuid(),
      round_id uuid references public.rounds(id) on delete cascade,
      player_id uuid references public.players(id),
      text text not null check (char_length(text) <= 100)
    );
    create table public.guesses (
      id uuid primary key default gen_random_uuid(),
      round_id uuid references public.rounds(id) on delete cascade,
      player_id uuid references public.players(id),
      answer_id uuid references public.submissions(id)
    );
    create table public.votes (
      id uuid primary key default gen_random_uuid(),
      round_id uuid references public.rounds(id) on delete cascade,
      player_id uuid references public.players(id),
      answer_id uuid references public.submissions(id)
    );

    insert into public.rooms (id, host_device_id) values ('TEST', 'host-test');
    insert into public.players (id, room_id, name, avatar)
      values ('11111111-1111-4111-8111-111111111111', 'TEST', 'Player', '🔴');
    insert into public.rounds (
      id, room_id, owner_id, category, prompt, deadline
    ) values (
      '22222222-2222-4222-8222-222222222222',
      'TEST',
      '11111111-1111-4111-8111-111111111111',
      'headline_hijack',
      '{"text": "Test prompt"}'::jsonb,
      now()
    );
    insert into public.submissions (id, round_id, player_id, text) values
      (
        '33333333-3333-4333-8333-333333333333',
        '22222222-2222-4222-8222-222222222222',
        '11111111-1111-4111-8111-111111111111',
        'First answer'
      ),
      (
        '44444444-4444-4444-8444-444444444444',
        '22222222-2222-4222-8222-222222222222',
        '11111111-1111-4111-8111-111111111111',
        'Duplicate answer'
      );
  `)

  await db.exec(reconciliation)

  const active = await db.query('select count(*)::int as count from public.submissions')
  const archived = await db.query(
    'select count(*)::int as count from archive.whatever_20260929_submissions',
  )
  assert.equal(active.rows[0].count, 1)
  assert.equal(archived.rows[0].count, 2)

  const deadline = await db.query(`
    select is_nullable
    from information_schema.columns
    where table_schema = 'public' and table_name = 'rounds' and column_name = 'deadline'
  `)
  assert.equal(deadline.rows[0]?.is_nullable, 'YES')

  await assert.rejects(
    db.exec(`
      insert into public.submissions (round_id, player_id, text)
      values (
        '22222222-2222-4222-8222-222222222222',
        '11111111-1111-4111-8111-111111111111',
        'Another duplicate'
      )
    `),
  )
  await db.close()
}

await verifyFreshInstall()
await verifyPopulatedPrototypeUpgrade()
console.log('Migration verification passed: fresh install and populated prototype upgrade')
