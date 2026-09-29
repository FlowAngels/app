# Supabase baseline

The migrations in this directory reconstruct the schema expected by the
recovered client, safely reconcile the populated prototype, and establish its
authenticated command and read-security boundary.

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

`20260929020000_authenticated_commands.sql` adds authenticated, transactional
commands and passes an end-to-end database rehearsal. Tim explicitly approved
its live deployment; all 11 functions, both ownership indexes, and their role
grants were verified.

The client-side command cutover is controlled by
`VITE_USE_AUTHENTICATED_COMMANDS` and is enabled in the ignored local
environment. `20260929030000_command_hardening.sql` makes clearing
a favourite transactional as well as selecting one, and recalculates the shared
category pool on disconnect. It is rehearsed, applied live, and verified.

`20260929040000_secure_reads_and_rls.sql` completes the read boundary and
enables RLS. Anonymous Auth, this migration, and the client feature switch were
deployed as one approved coordinated cutover. A live five-session test verified
room creation/joining, the full round flow, member and outsider visibility,
private answers, ownership, deadline enforcement, scoring, and idempotency.
`npm run test:live-secure` repeats a destructive six-round live smoke test with
five isolated anonymous sessions and creates a temporary room that must be
removed afterwards; it is not a routine CI test.

`20260929050000_round_scoring_and_results.sql` adds the agreed +1 Chameleon
point for each eligible player fooled by a decoy and stores post-reveal answer
ownership plus per-round Chameleon/Crowd awards in the round result. This lets
phones name the round winners and calculate personal standings without
weakening pre-result answer privacy. It passes the embedded fresh/populated
rehearsal and was applied to the live project on 2026-09-29. A six-round live
rehearsal verified the new result shape and both scoring tracks; all temporary
rooms and their dependent test data were then removed.

Before sharing a public URL, add CAPTCHA or equivalent abuse protection to both
Supabase anonymous sign-in and the client. Enabling it only in the dashboard
would break the current sign-in flow.

The migration makes `rounds.deadline` nullable because the current host flow
creates a round and begins its countdown as two separate actions. It also adds
`rounds.created_at`, which the recovered client uses to identify the latest
round but which was missing from the original planning SQL.
