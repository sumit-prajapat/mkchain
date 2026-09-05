-- MKChain Migration 005: Investigation case management

create table if not exists public.investigations (
  id bigserial primary key,
  title text not null,
  description text not null default '',
  status text not null default 'open',
  priority text not null default 'medium',
  assignee text not null default '',
  analysis_id bigint references public.wallet_analyses(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_investigations_status_updated
  on public.investigations(status, updated_at desc);

create table if not exists public.evidence (
  id bigserial primary key,
  investigation_id bigint not null references public.investigations(id) on delete cascade,
  name text not null,
  evidence_type text not null default 'link',
  uri text not null default '',
  description text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists public.investigation_notes (
  id bigserial primary key,
  investigation_id bigint not null references public.investigations(id) on delete cascade,
  body text not null,
  author text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists public.timeline_events (
  id bigserial primary key,
  investigation_id bigint not null references public.investigations(id) on delete cascade,
  event_type text not null default 'activity',
  summary text not null,
  created_at timestamptz not null default now()
);
