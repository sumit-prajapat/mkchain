-- ============================================================
-- DEPRECATED: use infra/supabase/migrations/ instead
-- Run 001_profiles.sql then 002_organizations.sql in order
-- ============================================================

-- 1. Profiles table (one row per user, auto-created on signup)
create table public.profiles (
  id                   uuid references auth.users(id) on delete cascade primary key,
  email                text not null,
  full_name            text,
  avatar_url           text,
  plan                 text not null default 'free',   -- 'free' | 'pro' | 'business' | 'enterprise'
  api_calls_used       integer not null default 0,
  addresses_used       integer not null default 0,
  billing_cycle_start  timestamptz default now(),
  stripe_customer_id   text,
  created_at           timestamptz default now(),
  updated_at           timestamptz default now()
);

-- 2. Row Level Security — users can only see/edit their own row
alter table public.profiles enable row level security;

create policy "Users can view own profile"
  on public.profiles for select
  using (auth.uid() = id);

create policy "Users can update own profile"
  on public.profiles for update
  using (auth.uid() = id);

-- 3. Auto-create a profile row when a new user signs up
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, full_name, avatar_url)
  values (
    new.id,
    new.email,
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'avatar_url'
  );
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- 4. Auto-update the updated_at timestamp on every update
create or replace function public.handle_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger profiles_updated_at
  before update on public.profiles
  for each row execute procedure public.handle_updated_at();

-- Done! You should now have a profiles table with RLS and two triggers.
