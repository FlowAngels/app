# Live Supabase audit — 2026-09-29

Read-only dashboard inspection of project `xdetfbvaryghuuoknwvl` (`Whatever!`)
in the `FlowAngels's Ltd` organization, region `ap-southeast-1`.

No schema, data, key, or project setting was changed during this audit.

## Project state

- Dashboard status: `Unhealthy`.
- Primary database is running on the Free-plan NANO instance.
- Data API is installed and enabled.
- Dashboard reports no migration history and no scheduled backups.
- All six public tables have RLS disabled and are reported as critical security
  findings.
- Existing legacy anon and both existing publishable keys return HTTP 401
  `Invalid API key` from the Data API. The dashboard displays those same keys,
  so this is not a local configuration mismatch.

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
Do not apply it directly to the populated live database: write an explicit,
data-aware reconciliation migration after deciding whether the old test rows
should be retained or archived.

## Next diagnostic action

Create one new browser-safe publishable key and test it without revoking any
existing key. Creating a persistent key requires Tim's confirmation at the
point of action. If the new key is also rejected, treat the project as a
Supabase platform/support recovery case rather than continuing to rotate keys.
