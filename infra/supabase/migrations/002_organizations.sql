-- MKChain Migration 002: Organizations, memberships, invitations

create type public.plan_tier as enum ('free', 'pro', 'team', 'enterprise');
create type public.member_role as enum ('owner', 'admin', 'analyst', 'viewer', 'billing');

create table if not exists public.organizations (
  id                   uuid primary key default gen_random_uuid(),
  name                 text not null,
  slug                 text not null unique,
  plan                 public.plan_tier not null default 'free',
  stripe_customer_id   text unique,
  settings             jsonb not null default '{}',
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create table if not exists public.memberships (
  id                   uuid primary key default gen_random_uuid(),
  org_id               uuid not null references public.organizations(id) on delete cascade,
  user_id              uuid not null references public.profiles(id) on delete cascade,
  role                 public.member_role not null default 'analyst',
  invited_by           uuid references public.profiles(id),
  joined_at            timestamptz not null default now(),
  unique (org_id, user_id)
);

create index if not exists idx_memberships_user on public.memberships(user_id);
create index if not exists idx_memberships_org on public.memberships(org_id);

create table if not exists public.org_invitations (
  id                   uuid primary key default gen_random_uuid(),
  org_id               uuid not null references public.organizations(id) on delete cascade,
  email                text not null,
  role                 public.member_role not null default 'analyst',
  token_hash           text not null unique,
  expires_at           timestamptz not null,
  accepted_at          timestamptz,
  created_at           timestamptz not null default now()
);

-- Link profiles to default org
alter table public.profiles
  drop constraint if exists profiles_default_org_fk;
alter table public.profiles
  add constraint profiles_default_org_fk
  foreign key (default_org_id) references public.organizations(id);

-- RLS
alter table public.organizations enable row level security;
alter table public.memberships enable row level security;

create policy "Members can view their organizations"
  on public.organizations for select
  using (
    id in (
      select org_id from public.memberships where user_id = auth.uid()
    )
  );

create policy "Members can view org memberships"
  on public.memberships for select
  using (
    org_id in (
      select org_id from public.memberships m where m.user_id = auth.uid()
    )
  );

-- Auto-create org on signup (replaces simple profile-only trigger)
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer
set search_path = public
as $$
declare
  new_org_id uuid;
  org_slug text;
begin
  insert into public.profiles (id, email, full_name, avatar_url)
  values (
    new.id,
    new.email,
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'avatar_url'
  )
  on conflict (id) do update set
    email = excluded.email,
    full_name = excluded.full_name,
    avatar_url = excluded.avatar_url;

  org_slug := 'org-' || substr(replace(new.id::text, '-', ''), 1, 12);

  insert into public.organizations (name, slug, plan)
  values (
    coalesce(new.raw_user_meta_data->>'full_name', 'My Organization'),
    org_slug,
    'free'
  )
  returning id into new_org_id;

  insert into public.memberships (org_id, user_id, role)
  values (new_org_id, new.id, 'owner')
  on conflict do nothing;

  update public.profiles
  set default_org_id = new_org_id
  where id = new.id;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
