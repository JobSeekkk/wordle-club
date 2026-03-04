# Wordle Club

Mini app for a private Wordle competition with friends (profile + daily score upload + daily ranking + season leaderboard).

## What it does

- Create a profile (name + color)
- Paste the Wordle share text
- Parse and store daily results
- Rank players by:
  1. **Fewer attempts** (best)
  2. **Tie-break:** lower hint score before the winning row (`green = 1`, `yellow = 0.5`)
- Give points using Mario Kart style by default: `15, 12, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1`
- Show a season leaderboard

## Scoring rules (implemented)

For each puzzle:

1. Solved rows rank above unsolved rows.
2. Among solved rows, fewer attempts are better.
3. If attempts are equal, lower `hintScoreBeforeSolve` is better.
4. If still equal, lower total hint score is better.
5. Exact ties get the same rank and same points.

## Storage modes

- **Supabase mode** (recommended): shared data across phones/laptops
- **Local mode** (fallback): browser-only storage for quick demo

Supabase mode is enabled when:

- `VITE_WORDLE_SUPABASE_URL` is set
- `VITE_WORDLE_SUPABASE_ANON_KEY` is set

## Setup

```bash
npm install
npm run dev
```

Create `.env.local` from `.env.example`:

```bash
cp .env.example .env.local
```

## Supabase setup (separate from JobSeek)

1. Create a **new Supabase project** dedicated to this app.
2. Open SQL editor and run: [`supabase/schema.sql`](/Users/paul/wordle-club/supabase/schema.sql)
3. Copy project URL + anon key into `.env.local`.
4. Restart dev server.

## Deploy for friends

Recommended quick setup:

1. Create a new GitHub repo (separate from JobSeek).
2. Push this project.
3. Deploy on Vercel or Netlify.
4. Add env vars (`VITE_WORDLE_SUPABASE_URL`, `VITE_WORDLE_SUPABASE_ANON_KEY`).
5. Share URL + one league code with your friends.

For basic privacy, use an unguessable league code and private sharing. If you want strict access control, add auth + stricter RLS as a next step.

## Scripts

- `npm run dev`
- `npm run build`
- `npm run preview`
- `npm run lint`
