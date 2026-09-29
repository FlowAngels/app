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
const commands = await readFile(
  new URL('../supabase/migrations/20260929020000_authenticated_commands.sql', import.meta.url),
  'utf8',
)
const commandHardening = await readFile(
  new URL('../supabase/migrations/20260929030000_command_hardening.sql', import.meta.url),
  'utf8',
)
const secureReads = await readFile(
  new URL('../supabase/migrations/20260929040000_secure_reads_and_rls.sql', import.meta.url),
  'utf8',
)
const roundScoring = await readFile(
  new URL('../supabase/migrations/20260929050000_round_scoring_and_results.sql', import.meta.url),
  'utf8',
)

async function prepareAuthSchema(db) {
  await db.exec(`
    create role anon nologin;
    create role authenticated nologin;
    create schema auth;
    create table auth.users (id uuid primary key default gen_random_uuid());
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
    $$;
  `)
}

async function setAuthUser(db, userId = '') {
  await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [userId])
}

async function verifyAuthenticatedCommands(db) {
  const hostUserId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
  const playerUserIds = [
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
  ]
  await db.exec(`
    insert into auth.users (id) values
      ('${hostUserId}'),
      ('${playerUserIds[0]}'),
      ('${playerUserIds[1]}'),
      ('${playerUserIds[2]}');
  `)

  await setAuthUser(db)
  await assert.rejects(
    db.query(`select public.whatever_create_room('device-123456')`),
    /Authentication required/,
  )

  await setAuthUser(db, hostUserId)
  const created = await db.query(`select public.whatever_create_room('device-123456') as id`)
  const roomId = created.rows[0].id
  assert.match(roomId, /^[A-Z2-9]{4}$/)

  const playerIds = []
  const names = ['Alex', 'Blair', 'Casey']
  const avatars = ['🔴', '🔵', '🟢']
  for (let index = 0; index < playerUserIds.length; index += 1) {
    await setAuthUser(db, playerUserIds[index])
    const joined = await db.query(
      `select public.whatever_join_room($1, $2, $3) as id`,
      [roomId, names[index], avatars[index]],
    )
    playerIds.push(joined.rows[0].id)
    if (index === 0) {
      await assert.rejects(
        db.query(
          `select public.whatever_set_categories($1, $2::text[])`,
          [playerIds[index], ['headline_hijack', 'headline_hijack']],
        ),
        /Invalid category selection/,
      )
    }
    const selectedCategories = index === 0
      ? ['headline_hijack']
      : ['headline_hijack', 'meme_mash']
    const categories = await db.query(
      `select public.whatever_set_categories($1, $2::text[]) as pool`,
      [playerIds[index], selectedCategories],
    )
    assert.deepEqual(categories.rows[0].pool, ['headline_hijack'])
  }

  await setAuthUser(db, playerUserIds[0])
  await db.query(`select public.whatever_set_connected($1, false)`, [playerIds[0]])
  const disconnectedPool = await db.query(`select category_pool from public.rooms where id = $1`, [roomId])
  assert.deepEqual(disconnectedPool.rows[0].category_pool, ['headline_hijack', 'meme_mash'])
  await db.query(`select public.whatever_set_connected($1, true)`, [playerIds[0]])
  const reconnectedPool = await db.query(`select category_pool from public.rooms where id = $1`, [roomId])
  assert.deepEqual(reconnectedPool.rows[0].category_pool, ['headline_hijack'])

  await setAuthUser(db, hostUserId)
  const started = await db.query(
    `select public.whatever_start_round($1, 'headline_hijack', 'Test ___ headline') as id`,
    [roomId],
  )
  const roundId = started.rows[0].id
  await db.query(`select public.whatever_begin_round($1)`, [roundId])

  const submissionIds = []
  for (let index = 0; index < playerUserIds.length; index += 1) {
    await setAuthUser(db, playerUserIds[index])
    const submitted = await db.query(
      `select public.whatever_submit_answer($1, $2) as id`,
      [roundId, `Answer ${index + 1}`],
    )
    submissionIds.push(submitted.rows[0].id)
  }

  await setAuthUser(db, hostUserId)
  const revealed = await db.query(`select public.whatever_reveal_round($1) as items`, [roundId])
  assert.equal(revealed.rows[0].items.length, 3)

  await setAuthUser(db, playerUserIds[0])
  await assert.rejects(
    db.query(`select public.whatever_set_guess($1, $2)`, [roundId, submissionIds[0]]),
    /Cannot guess your own answer/,
  )
  await db.query(`select public.whatever_set_guess($1, $2)`, [roundId, submissionIds[1]])
  await db.query(`select public.whatever_set_vote($1, $2)`, [roundId, submissionIds[2]])
  await db.query(`select public.whatever_set_vote($1, null)`, [roundId])
  const clearedVotes = await db.query(
    `select count(*)::int as count from public.votes where round_id = $1 and player_id = $2`,
    [roundId, playerIds[0]],
  )
  assert.equal(clearedVotes.rows[0].count, 0)
  await db.query(`select public.whatever_set_vote($1, $2)`, [roundId, submissionIds[2]])

  await setAuthUser(db, playerUserIds[1])
  await db.query(`select public.whatever_set_guess($1, $2)`, [roundId, submissionIds[0]])
  await db.query(`select public.whatever_set_vote($1, $2)`, [roundId, submissionIds[2]])

  await setAuthUser(db, playerUserIds[2])
  await db.query(`select public.whatever_set_guess($1, $2)`, [roundId, submissionIds[1]])
  await db.query(`select public.whatever_set_vote($1, $2)`, [roundId, submissionIds[1]])

  await db.query(`update public.rounds set vote_deadline = now() - interval '1 second' where id = $1`, [roundId])
  await setAuthUser(db, hostUserId)
  const finalized = await db.query(
    `select public.whatever_finalize_round($1) as results`,
    [roundId],
  )
  assert.equal(finalized.rows[0].results.ownerSweetSpot, true)
  assert.deepEqual(finalized.rows[0].results.correctGuessers, [playerIds[1]])
  assert.equal(finalized.rows[0].results.roundChameleon[playerIds[0]], 3)
  assert.equal(finalized.rows[0].results.roundChameleon[playerIds[1]], 3)
  assert.equal(finalized.rows[0].results.roundCrowd[playerIds[2]], 2)
  assert.equal(finalized.rows[0].results.answerOwners[submissionIds[0]], playerIds[0])

  const leaderboard = await db.query(`select leaderboards, round_index from public.rooms where id = $1`, [roomId])
  assert.equal(leaderboard.rows[0].round_index, 1)
  assert.equal(leaderboard.rows[0].leaderboards.chameleon[playerIds[0]], 3)
  assert.equal(leaderboard.rows[0].leaderboards.chameleon[playerIds[1]], 3)

  const finalizedAgain = await db.query(
    `select public.whatever_finalize_round($1) as results`,
    [roundId],
  )
  assert.deepEqual(finalizedAgain.rows[0].results, finalized.rows[0].results)
  const unchanged = await db.query(`select round_index from public.rooms where id = $1`, [roomId])
  assert.equal(unchanged.rows[0].round_index, 1)

  await setAuthUser(db, playerUserIds[0])
  await db.exec(`set role authenticated`)
  const visibleRoom = await db.query(`select count(*)::int as count from public.rooms`)
  assert.equal(visibleRoom.rows[0].count, 1)
  const ownSubmission = await db.query(`select count(*)::int as count from public.submissions`)
  assert.equal(ownSubmission.rows[0].count, 1)
  const revealItems = await db.query(`select public.whatever_reveal_items($1) as items`, [roundId])
  assert.equal(revealItems.rows[0].items.length, 3)
  await assert.rejects(
    db.query(`insert into public.rooms (id, host_device_id) values ('NOPE', 'device-blocked')`),
    /permission denied/,
  )
  await db.exec(`reset role`)

  await setAuthUser(db, 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee')
  await db.exec(`set role authenticated`)
  const hiddenRooms = await db.query(`select count(*)::int as count from public.rooms`)
  assert.equal(hiddenRooms.rows[0].count, 0)
  const preview = await db.query(`select public.whatever_room_preview($1) as room`, [roomId])
  assert.equal(preview.rows[0].room.playerCount, 3)
  await assert.rejects(
    db.query(`select public.whatever_reveal_items($1)`, [roundId]),
    /Room access required/,
  )
  await db.exec(`reset role`)
}

async function verifyFreshInstall() {
  const db = new PGlite()
  await db.waitReady
  await prepareAuthSchema(db)
  await db.exec(baseline)
  await db.exec(reconciliation)
  await db.exec(commands)
  await db.exec(commandHardening)
  await db.exec(secureReads)
  await db.exec(roundScoring)

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
  await verifyAuthenticatedCommands(db)
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
  await db.exec(commands)
  await db.exec(commandHardening)
  await db.exec(secureReads)
  await db.exec(roundScoring)

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
