# Whatever! — project context and decision record

Last reviewed: 2026-09-29

## Product intent

Whatever! is a same-room social game for 3–8 people. A shared host screen runs
the game and phones act as private controllers. Everyone answers the same
creative prompt. Players then separately:

1. guess which answer belongs to the rotating Round Owner; and
2. choose the answer they enjoyed most.

The intended hook is the tension between sounding recognisably like yourself
and delighting the room. It is not a personal-trivia game about the Round Owner.

The original scoring rules are authoritative until playtest evidence supports
a deliberate change:

- each correct guesser receives +2 Chameleon points;
- the Round Owner receives +3 Chameleon points only when some, but not all,
  eligible guessers identify them; and
- each favourite vote gives the answer's author +1 Crowd point.

## Recovered state

The codebase is a secured interactive prototype, not yet a playable MVP. It
contains room creation and joining, QR links, private category selection, round
creation, answer entry, anonymous reveal data, a combined guess/favourite
controller, preliminary results, and JSON leaderboards.

Baseline cleanup completed locally on 2026-09-29:

- the recovered 2025 working tree is preserved in commit `678780b`;
- a clean `npm ci`, tests, lint, and production build pass;
- eight tests cover scoring boundaries and all-player category consensus;
- the dependency tree has zero known audit vulnerabilities;
- database types, a reconstructed migration, and CI checks are versioned; and
- the original single-favourite, +2 guess, and +3 sweet-spot rules are restored.

The live Supabase project exists and contains prototype data. A new approved
browser-safe publishable key restored local access after its recovered keys
returned HTTP 401. Its schema has been compared with the reconstructed
migration. A local JSON safety copy and a data-aware reconciliation migration
were prepared and rehearsed against both fresh and populated prototype states.
Tim explicitly approved the live operation, and the migration was applied and
verified on 2026-09-29. See `supabase/LIVE_AUDIT_2026-09-29.md` and
`supabase/RECOVERY_RUNBOOK.md`.

The next security layer was prepared and deployed with Tim's explicit approval:
`20260929020000_authenticated_commands.sql` adds anonymous-user ownership and
transactional commands for room creation/joining, category choices, round
start, answering, reveal, guessing, voting, and idempotent final scoring. Its
rehearsal completes a three-player round and verifies the original scoring
rules. The live verification found all 11 functions, both ownership indexes,
and the intended execution grants.

The client uses the authenticated-command path through
`VITE_USE_AUTHENTICATED_COMMANDS=true` in the ignored local environment. The
secure path covers all material game writes; a follow-up
migration preserves the controller's ability to clear a favourite vote and
keeps category consensus correct as players disconnect. That hardening was
applied and verified live on 2026-09-29.

The coordinated read-security migration
`20260929040000_secure_reads_and_rls.sql` is live. Anonymous Auth is enabled;
join-safe room previews, answer-free submission progress, refreshable reveal
items, member-scoped reads, and write-denying RLS policies now protect the live
project. A five-session live test completed a full three-player round and
verified private answers, outsider isolation, ownership checks, vote clearing,
deadline enforcement, original scoring, and idempotent finalisation. Its test
room was removed and the original live row counts were restored.

## Fidelity references

- The nine prompts in `src/lib/prompts.ts` are Claude-generated placeholders,
  not approved content. They do not constitute the planned 60-prompt library.
- The original splash mock-up remains outside this nested Git repository at
  `../assets/Mock-up Splash screen.png`. The current coded splash is an
  approximation and is not approved as a faithful replacement.
- Keep `Whatever!` as a working title until trademark and discoverability have
  been checked for any public release.

## Material product and engineering gaps

1. The host screen does not present reveal, ownership, results, leaderboards,
   next-round rotation, game end, and replay as one coherent sequence.
2. Although deadlines, transitions, and scoring are persisted and
   transactional, a sleeping or disconnected host can still stall automatic
   phase progression.
3. Refresh/rejoin does not yet reconstruct every screen and local interaction
   state cleanly.
4. The UI claims room expiry, but no cleanup job is versioned.
5. CAPTCHA or equivalent abuse protection is not configured for anonymous
   sign-ins; add it with a matching client flow before sharing a public URL.
6. Content is far below plan: nine placeholder prompts and no licensed image
   set instead of 60 prompts and 12–16 images.

## Current plan

Build one faithful vertical slice before broadening the game:

`lobby → prompt → answer → reveal → guess → favourite → results → next round`

Use Headline Hijack first. The authoritative command boundary, persisted
deadlines, and idempotent scoring are now in place; finish the shared host
sequence, human-readable results, dual leaderboard, next-round rotation, and
refresh/rejoin recovery. The exit condition is three real phones plus one host
completing six rounds without developer intervention.

The first host vertical-slice pass was implemented on 2026-09-29. The shared
screen now presents anonymous revealed answers, the Round Owner and their
answer, the Chameleon outcome, the crowd favourite, named dual leaderboards,
and a next-round handoff. Player results now mirror those outcomes, and the
answer timer visibly updates. A browser review also found that the Tailwind 4
build was using legacy CSS directives; switching to the supported import
restored the intended styling across the lobby and mobile screens. The splash
was made responsive and visually checked against the recovered mock-up. This
slice still needs the exit-condition multi-device playtest before it can be
called a playable MVP.

Then run five observed playtests across different relationship types. Continue
only if at least three groups voluntarily play another game or ask to use it
again. Treat one excellent personal game night as success; a company is not the
default outcome.

If the loop earns further investment, test a host-paid occasion pack or private
custom room before considering subscriptions. Do not add payments before repeat
hosting behaviour is demonstrated.

## Boundaries

- Do not deploy, alter a live database, or enable payments without Tim's
  explicit approval.
- Do not expand categories before the original dual-objective loop works.
- Do not pivot to personal questions without an explicit product decision and
  comparative playtest.
- Realtime distributes persisted state; it must not be the sole source of game
  truth.
