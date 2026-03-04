create extension if not exists pgcrypto;

create table if not exists public.players (
  id uuid primary key default gen_random_uuid(),
  league_code text not null,
  name text not null,
  color text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.submissions (
  id uuid primary key default gen_random_uuid(),
  league_code text not null,
  player_id uuid not null references public.players(id) on delete cascade,
  puzzle_number integer not null check (puzzle_number > 0),
  attempts_used integer,
  max_attempts integer not null default 6,
  solved boolean not null default true,
  hint_score_before_solve numeric(6,2) not null default 0,
  total_hint_score numeric(6,2) not null default 0,
  raw_share text not null,
  attempt_rows text[] not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (league_code, player_id, puzzle_number)
);

create index if not exists submissions_league_puzzle_idx on public.submissions (league_code, puzzle_number desc);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger submissions_set_updated_at
before update on public.submissions
for each row
execute function public.set_updated_at();

alter table public.players enable row level security;
alter table public.submissions enable row level security;

-- Quick friend-league setup: anonymous read/write is allowed.
-- For stronger access control, switch to authenticated users + stricter RLS.
create policy "players_public_read"
on public.players
for select
using (true);

create policy "players_public_insert"
on public.players
for insert
with check (true);

create policy "players_public_update"
on public.players
for update
using (true)
with check (true);

create policy "submissions_public_read"
on public.submissions
for select
using (true);

create policy "submissions_public_insert"
on public.submissions
for insert
with check (true);

create policy "submissions_public_update"
on public.submissions
for update
using (true)
with check (true);
