# Whatever!

A revived, couch-first social party game. One shared screen hosts the game;
3–8 players use their phones to answer, identify the round owner's answer, and
vote for a favourite. The longer product vision also includes private remote
rooms, optional non-human players, and eventually moderated public games.

The secured six-round vertical slice compiles and has passed an unattended live
multi-session game, but it still needs human playtesting before it is a proven
MVP. Read
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
npm run test:migrations
```

The clean install, build, lint, 12 behavior tests, fresh/populated database
migration rehearsals, and a six-round live test pass as of 2026-09-29. `npm
audit` reports zero known vulnerabilities. The original Supabase project is
reconciled and secured with anonymous Auth, authenticated commands, safe reads,
and RLS; read
[`supabase/README.md`](supabase/README.md) before changing the live backend.
