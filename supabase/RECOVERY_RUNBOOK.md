# Supabase recovery runbook

Prepared: 2026-09-29  
Project: `xdetfbvaryghuuoknwvl` (`Whatever!`)

This runbook separates recovery of the existing project from the later security
architecture. Both live operations were explicitly approved, applied, and
verified on 2026-09-29.

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

## Completed live operation 2 — anonymous identity and RLS

The command functions, client switch, anonymous identity, safe read functions,
and RLS policies were deployed as one coordinated cutover. Completion evidence:

1. Anonymous sign-in produced distinct ephemeral user IDs for five sessions.
2. `20260929040000_secure_reads_and_rls.sql` applied successfully and RLS is
   enabled on all six public game tables.
3. Three players joined a host's room and completed a round entirely through
   authenticated commands and safe reads.
4. Members saw only permitted rows; the host could not read private in-progress
   answers; an outsider could not read the room or revealed answers; and a
   direct player update was rejected.
5. Deadline enforcement, vote clearing, original scoring, and repeat-safe
   finalisation all passed.
6. `VITE_USE_AUTHENTICATED_COMMANDS=true` is set in the tested local
   environment.
7. The temporary test room and its dependent rows were removed, restoring the
   original active row counts.

Anonymous Auth provides identity, not authority. The deployed command functions
and RLS policies provide the authority boundary.

## Completed live operation 3 — creative scoring and result detail

Tim explicitly approved `20260929050000_round_scoring_and_results.sql` for the
live project on 2026-09-29. Completion evidence:

1. The deployed function definition contains the post-reveal `answerOwners`
   result and decoy-scoring branch.
2. Execute remains granted to `authenticated` and denied to `anon`.
3. A six-round live rehearsal verified rotating owners, +1 decoy awards,
   per-round Crowd awards, private answers, outsider isolation, refresh and
   reconnect recovery, deadline enforcement, and repeat-safe finalisation.
4. The completed rehearsal and two diagnostic rehearsal rooms were deleted in
   dependency order. A follow-up query returned zero `live-verify-` rooms.

## Remaining public-release boundary

Do not share a public URL until anonymous-sign-in abuse protection is designed
and tested end to end. Supabase recommends CAPTCHA; its dashboard setting and
the corresponding client token flow must be introduced together.
