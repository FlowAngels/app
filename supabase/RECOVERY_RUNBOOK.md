# Supabase recovery runbook

Prepared: 2026-09-29  
Project: `xdetfbvaryghuuoknwvl` (`Whatever!`)

This runbook separates recovery of the existing project from the later security
architecture. Live operation 1 was explicitly approved, applied, and verified
on 2026-09-29. Live operation 2 has not been performed.

## Evidence already captured

- Read-only audit: `LIVE_AUDIT_2026-09-29.md`
- Local JSON safety copy: ignored `.local-backups/supabase-2026-09-29/`
- Expected row counts: 6 rooms, 12 players, 11 rounds, 3 submissions,
  0 guesses, and 0 votes
- One duplicate submission pair is preserved in the archive and reduced to one
  deterministic active row by the reconciliation
- Fresh and populated upgrade rehearsals: `npm run test:migrations`

## Completed live operation 1 — schema reconciliation

Tim explicitly approved this operation. Completion evidence:

1. `npm run test:migrations` and all normal project checks passed.
2. Only
   `migrations/20260929010000_reconcile_live_prototype.sql` in the Supabase SQL
   editor was executed; the recovered baseline was not run against the populated
   project.
3. The transaction completed without error.
4. Active row counts are 6, 12, 11, 2, 0, and 0 respectively.
5. Archive row counts are 6, 12, 11, 3, 0, and 0.
6. Seven structural checks all returned true.
7. The existing publishable key reads the reconciled API with HTTP 200.

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
