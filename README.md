# Whatever!

A recovered prototype of a same-room social party game. One shared screen hosts
the game; 3–8 players use their phones to answer, identify the round owner's
answer, and vote for a favourite.

This repository compiles, but it is not yet a complete MVP. Read
[`docs/PROJECT_CONTEXT.md`](docs/PROJECT_CONTEXT.md) before changing product
behaviour or expanding scope.

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
npm test
```

The clean install, build, lint, scoring and category-consensus tests pass as of
2026-09-29, and `npm audit` reports zero known vulnerabilities. The recovered Supabase
credentials no longer authenticate; read [`supabase/README.md`](supabase/README.md)
before connecting or creating a backend.
