# Supabase baseline

The migration in this directory reconstructs the schema expected by the
recovered client. It is a fidelity baseline, not a production security model.

The live project was inspected read-only on 2026-09-29. It contains the six
expected tables plus prototype data, but all existing browser keys return HTTP
401 from the enabled Data API. Read
[`LIVE_AUDIT_2026-09-29.md`](LIVE_AUDIT_2026-09-29.md) before changing it.
Before reconnecting the client:

1. Restore working API-key access to the existing project.
2. Reconcile its tables, constraints and Realtime publication with the migration.
3. Apply differences through a new migration; do not edit the baseline after it
   has been used.
4. Generate fresh TypeScript database types and compare them with
   `src/types/database.ts`.
5. Move authoritative transitions and scoring behind database functions or
   Edge Functions, then enable RLS before public deployment.

The migration makes `rounds.deadline` nullable because the current host flow
creates a round and begins its countdown as two separate actions. It also adds
`rounds.created_at`, which the recovered client uses to identify the latest
round but which was missing from the original planning SQL.
