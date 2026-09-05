-- MKChain Migration 001: User profiles (extends Supabase auth.users)
-- Run in Supabase SQL Editor if not already applied.

create table if not exists public.profiles (
  id                   uuid references auth.users(id) on delete cascade primary key,
  email                text not null,
  full_name            text,
  avatar_url           text,
  default_org_id       uuid,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

alter table public.profiles enable row level security;

drop policy if exists "Users can view own profile" on public.profiles;
create policy "Users can view own profile"
  on public.profiles for select
  using (auth.uid() = id);

drop policy if exists "Users can update own profile" on public.profiles;
create policy "Users can update own profile"
  on public.profiles for update
  using (auth.uid() = id);

create or replace function public.handle_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_updated_at on public.profiles;
create trigger profiles_updated_at
  before update on public.profiles
  for each row execute procedure public.handle_updated_at();
