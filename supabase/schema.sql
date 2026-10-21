-- Run in the Supabase SQL editor. Safe to run more than once.
-- Each signed-in user can read and change only their own rows.

create table if not exists public.holdings (
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  ticker text not null,
  shares numeric not null,
  cost numeric not null default 0,
  sector text not null default '',
  updated_at timestamptz not null default now(),
  primary key (user_id, ticker)
);

create table if not exists public.notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  text text not null,
  created_at timestamptz not null default now()
);

alter table public.holdings enable row level security;
alter table public.notes enable row level security;

drop policy if exists "Users manage their own holdings" on public.holdings;
create policy "Users manage their own holdings" on public.holdings
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "Users manage their own notes" on public.notes;
create policy "Users manage their own notes" on public.notes
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create table if not exists public.watchlist (
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  ticker text not null,
  added_at timestamptz not null default now(),
  primary key (user_id, ticker)
);

create table if not exists public.alerts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  ticker text not null,
  kind text not null check (kind in ('above', 'below', 'move')),
  value numeric not null,
  triggered_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.watchlist enable row level security;
alter table public.alerts enable row level security;

drop policy if exists "Users manage their own watchlist" on public.watchlist;
create policy "Users manage their own watchlist" on public.watchlist
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "Users manage their own alerts" on public.alerts;
create policy "Users manage their own alerts" on public.alerts
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
