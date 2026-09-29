# Whatever! — Codex working agreement

Read `docs/PROJECT_CONTEXT.md` before changing product behaviour. It records the
recovered implementation, original intent, current risks, and revival plan.

## Product intent

Whatever! is a couch-first social game for 3–8 people. A shared host screen runs
the initial mode and phones act as private controllers. Everyone answers the
same creative prompt; players then try to recognise the Round Owner's answer
while also voting for the answer they most enjoyed. Its intended advantage over
a generic prompt-and-vote game is this tension between recognisable voice and
crowd appeal. The longer vision includes private remote rooms, optional
non-human players, and eventually moderated public matchmaking; do not make the
current couch validation slice an architectural dead end.

Chameleon scoring rewards a correct owner guess (+2), a decoy that fools
another eligible player (+1 per fooled player), and an owner recognised by some
but not all eligible players (+3). Crowd scoring remains separate at +1 per
favourite vote. Phones omit the player's own answer from both choices.

Keep the round legible from across a room, minimise host babysitting, and never
reveal a player's category choices or answer ownership before results.

## Current boundaries

- Stack: React, TypeScript, Vite, Tailwind, Supabase Postgres + Realtime.
- Routes: `/`, `/lobby`, and `/join` (`/host` redirects to `/lobby`).
- Do not expose or commit `.env.local`.
- The live Supabase schema is reconciled through the versioned migrations dated
  2026-09-29. `20260929050000_round_scoring_and_results.sql` is rehearsed but
  not live; applying it requires Tim's explicit approval.
- Recovered 2025 work is preserved in commit `678780b`. Keep later changes
  small and reviewable.
- Do not deploy, alter the live database, or enable payments without Tim's
  explicit approval.

## Quality bar

Before calling work complete:

1. Run `npm run build` and `npm run lint`.
2. Add automated tests for scoring and state transitions affected by the work.
3. Exercise a real multi-client path: one host plus at least three player
   sessions.
4. Verify refresh/rejoin, AFK timeout, duplicate actions, and host disconnect.
5. Update `docs/PROJECT_CONTEXT.md` when a milestone or known risk changes.

The server/database must be authoritative for phase transitions and scoring.
Client timers may display time but must not be the only mechanism that advances
a game. Treat all browser input and room codes as untrusted.

## Product decisions still open

- Validate the dual-objective loop with one varied prompt deck. Treat the three
  recovered category names as unverified Claude-era scaffolding, not settled
  product intent. Do not turn it into personal trivia without an explicit
  product decision and comparative playtest.
- Decide whether the shared TV is essential or optional after playtesting.
- The name `Whatever!` is a working title; do not invest further in it before a
  trademark and discoverability check.
- Monetisation is an experiment after retention, not an MVP dependency.
