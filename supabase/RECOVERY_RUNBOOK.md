# Supabase recovery runbook

Prepared: 2026-09-29  
Project: `xdetfbvaryghuuoknwvl` (`Whatever!`)

This runbook separates recovery of the existing project from the later security
architecture. Neither live step below has been performed yet.

## Evidence already captured

- Read-only audit: `LIVE_AUDIT_2026-09-29.md`
- Local JSON safety copy: ignored `.local-backups/supabase-2026-09-29/`
- Expected row counts: 6 rooms, 12 players, 11 rounds, 3 submissions,
  0 guesses, and 0 votes
- One duplicate submission pair is preserved in the archive and reduced to one
  deterministic active row by the reconciliation
- Fresh and populated upgrade rehearsals: `npm run test:migrations`

## Approved live operation 1 — schema reconciliation

Only after Tim explicitly approves altering the live database:

1. Re-run `npm run test:migrations` and all normal project checks.
2. Execute only
   `migrations/20260929010000_reconcile_live_prototype.sql` in the Supabase SQL
   editor. Do not execute the recovered baseline against the populated project.
3. Confirm the transaction completed without error.
4. Confirm the active row counts are 6, 12, 11, 2, 0, and 0 respectively.
5. Confirm the archive row counts remain 6, 12, 11, 3, 0, and 0.
6. Confirm the existing publishable key can still read the room table.
7. Record the live result in `LIVE_AUDIT_2026-09-29.md`.

The SQL runs as one transaction. A failure before `commit` leaves the live
schema unchanged. The database archive plus the local JSON copy provide two
independent recovery sources after a successful commit.

## Approved live operation 2 — anonymous identity

Do not enable anonymous sign-ins merely to make the current direct-write client
work. First add authenticated command functions and RLS policies locally and
rehearse them. Then, after Tim explicitly approves the project setting change:

1. Enable anonymous sign-ins in Supabase Auth.
2. Verify a new browser session receives an anonymous user ID.
3. Verify RLS allows that user to join one room and act only as their player.
4. Verify a player cannot impersonate the host, read private in-progress
   answers, vote as another player, or mutate final scores.

Anonymous Auth provides identity, not authority. The command functions and RLS
policies remain mandatory before any public URL is shared.

## Recovery boundary

This reconciliation deliberately does not enable RLS. Enabling RLS now would
break the recovered browser client because it still writes directly to tables.
The next implementation stage is a single Headline Hijack vertical slice with
server-authoritative phase changes and scoring. Only that slice should receive
the first secure policies and command functions.
