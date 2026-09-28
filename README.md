# Whatever!

A recovered prototype of a same-room social party game. One shared screen hosts
the game; 3–8 players use their phones to answer, identify the round owner's
answer, and vote for a favourite.

This repository compiles, but it is not yet a complete MVP. Read
[`../docs/PROJECT_STATE.md`](../docs/PROJECT_STATE.md) before working on it and
[`../docs/REVIVAL_PLAN.md`](../docs/REVIVAL_PLAN.md) before expanding scope.

## Local setup

```bash
npm ci
cp .env.example .env.local
npm run dev
```

Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in `.env.local`. Never
commit that file.

Routes:

- `/` — landing screen
- `/lobby` — shared host screen
- `/join?room=CODE` — player controller

## Checks

```bash
npm run build
npm run lint
```

The production build passes as of 2026-09-29. Lint still exposes recovered
prototype debt; see the project-state document for the current count and risks.
