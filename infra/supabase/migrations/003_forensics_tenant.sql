-- MKChain Migration 003: Tenant columns on forensics tables (if tables exist from API)

-- Add org_id to wallet_analyses when table exists
do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'wallet_analyses'
  ) then
    alter table public.wallet_analyses
      add column if not exists org_id uuid references public.organizations(id) on delete cascade;
    alter table public.wallet_analyses
      add column if not exists created_by uuid references public.profiles(id);
    alter table public.wallet_analyses
      add column if not exists status text not null default 'completed';
    create index if not exists idx_analyses_org_created
      on public.wallet_analyses(org_id, created_at desc);
  end if;
end $$;

-- Watched addresses / alerts tenant columns
do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'watched_addresses') then
    alter table public.watched_addresses
      add column if not exists org_id uuid references public.organizations(id) on delete cascade;
    alter table public.watched_addresses
      add column if not exists created_by uuid references public.profiles(id);
  end if;
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'alerts') then
    alter table public.alerts
      add column if not exists org_id uuid references public.organizations(id) on delete cascade;
  end if;
end $$;
