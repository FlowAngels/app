# Supabase baseline

The migrations in this directory reconstruct the schema expected by the
recovered client and safely reconcile the populated prototype. They establish
a recoverable baseline, not a production security model.

The live project was inspected on 2026-09-29. It contains the six expected
tables plus prototype data. Its recovered browser keys returned HTTP 401, but a
new approved publishable key restored local read access. Read
[`LIVE_AUDIT_2026-09-29.md`](LIVE_AUDIT_2026-09-29.md) before changing it.
Current recovery state:

1. The ignored `.env.local` uses the working publishable key.
2. A local JSON copy of all six tables is stored under the ignored
   `.local-backups/` directory.
3. `20260929010000_reconcile_live_prototype.sql` archives the live rows inside
   Postgres before tightening constraints and adding recovery-ready columns.
4. `npm run test:migrations` rehearses a fresh installation and the populated
   prototype upgrade in embedded PostgreSQL and currently passes.
5. Tim explicitly approved the reconciliation, and it was applied and verified
   on 2026-09-29. The active/archive counts and structural checks matched the
   rehearsed outcome; see [`RECOVERY_RUNBOOK.md`](RECOVERY_RUNBOOK.md).

After reconciliation, move authoritative transitions and scoring behind
database functions or Edge Functions, enable anonymous Auth for ephemeral
players, and apply RLS before a public deployment. The current direct browser
writes must not be treated as production-safe.

`20260929020000_authenticated_commands.sql` is the prepared first part of that
work. It adds authenticated, transactional commands and passes an end-to-end
database rehearsal, but has not been applied live. It intentionally leaves RLS
disabled until the client reads and writes exclusively through safe interfaces.

The migration makes `rounds.deadline` nullable because the current host flow
creates a round and begins its countdown as two separate actions. It also adds
`rounds.created_at`, which the recovered client uses to identify the latest
round but which was missing from the original planning SQL.
