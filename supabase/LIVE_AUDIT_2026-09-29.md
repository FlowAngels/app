# Live Supabase audit — 2026-09-29

Read-only dashboard inspection of project `xdetfbvaryghuuoknwvl` (`Whatever!`)
in the `FlowAngels's Ltd` organization, region `ap-southeast-1`.

The initial audit was read-only. After Tim's explicit approval, one new
browser-safe publishable key named `codex_recovery_test` was created to restore
client access. No secret key, schema, data, or project setting was changed.

## Project state

- Dashboard status: `Unhealthy`.
- Primary database is running on the Free-plan NANO instance.
- Data API is installed and enabled.
- Dashboard reports no migration history and no scheduled backups.
- All six public tables have RLS disabled and are reported as critical security
  findings.
- The existing legacy anon and two earlier publishable keys returned HTTP 401
  `Invalid API key` from the Data API. A newly created publishable key returns
  HTTP 200 and is now used by the ignored local environment file.

## Existing data

The database is not empty. The dashboard showed:

| Table | Rows |
| --- | ---: |
| rooms | 6 |
| players | 12 |
| rounds | 11 |
| submissions | 3 |
| guesses | 0 |
| votes | 0 |

The data appears to be prototype/test-session data. Two submission rows target
the same player and round, demonstrating the missing uniqueness constraint.

## Material differences from the reconstructed baseline

- Live `rooms` includes an additional nullable `warned` boolean.
- Live `players.room_id`, `selected_categories`, and `created_at` are nullable.
- Live `rounds.room_id` is nullable and `deadline` is non-nullable. The recovered
  two-stage start flow inserts a round before setting its deadline, so it cannot
  work against the live constraint.
- Live submission, guess, and vote ownership columns are nullable.
- Live submissions only constrain answer length to at most 100 characters; an
  empty answer is not rejected by the database.
- Live submissions, guesses, and votes lack per-player/per-round uniqueness.
- Foreign-key delete behaviour is inconsistent across the dependent tables.

The reconstructed migration intentionally tightens most of these constraints
and makes `rounds.deadline` nullable to match the recovered two-stage client.
The explicit data-aware migration
`20260929010000_reconcile_live_prototype.sql` now preserves all existing rows in
an access-restricted `archive` schema, removes the one duplicate from the active
table, and tightens the active schema. It has passed a populated-prototype
rehearsal but has not been applied live.

## Access recovery outcome

The local app is reconnected to the original project with a browser-safe key.
Existing keys were not deliberately revoked or changed. A local JSON safety
copy of all six tables was captured under the ignored `.local-backups/`
directory. The next live database step is the reviewed reconciliation described
in `RECOVERY_RUNBOOK.md`; do not apply the reconstructed baseline migration
directly to this populated project.
