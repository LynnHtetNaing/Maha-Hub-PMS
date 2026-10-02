-- Maha Connect foundation schema (Phase 1 draft)
-- Run in a dedicated Supabase project or schema when ready for cloud.
-- Does NOT replace maha_cloud blob used by Maha Hub.
-- Secrets must never be stored in plaintext; use app-level encryption before insert.
-- RLS policies below are starter templates — tighten before production.

create extension if not exists pgcrypto with schema extensions;

create table if not exists mc_organizations (
  id text primary key,
  name text not null,
  status text not null default 'active',
  created_at timestamptz not null default now()
);

create table if not exists mc_properties (
  id text primary key,
  org_id text not null references mc_organizations(id),
  hub_code text,
  name text not null,
  timezone text default 'Asia/Bangkok',
  currency text default 'THB',
  country_code text,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists mc_properties_org_idx on mc_properties(org_id);
create unique index if not exists mc_properties_hub_code_uidx on mc_properties(hub_code) where hub_code is not null;

create table if not exists mc_room_types (
  id text primary key,
  property_id text not null references mc_properties(id) on delete cascade,
  code text not null,
  name text not null,
  total_rooms int not null default 0,
  max_occupancy int,
  base_rate numeric(12,2) default 0,
  active boolean not null default true,
  unique (property_id, code)
);

create table if not exists mc_rate_plans (
  id text primary key,
  property_id text not null references mc_properties(id) on delete cascade,
  code text not null,
  name text not null,
  currency text,
  meal_plan text,
  kind text default 'base',
  active boolean not null default true,
  unique (property_id, code)
);

create table if not exists mc_derived_rates (
  id text primary key,
  property_id text not null references mc_properties(id) on delete cascade,
  child_rate_id text not null references mc_rate_plans(id) on delete cascade,
  parent_rate_id text not null references mc_rate_plans(id) on delete cascade,
  rule_type text not null check (rule_type in ('pct_up','pct_down','amt_up','amt_down')),
  rule_value numeric(12,4) not null default 0,
  unique (child_rate_id)
);

create table if not exists mc_inventory_daily (
  property_id text not null references mc_properties(id) on delete cascade,
  room_type_id text not null references mc_room_types(id) on delete cascade,
  stay_date date not null,
  total int not null default 0,
  sold int not null default 0,
  blocked int not null default 0,
  ooo int not null default 0,
  sellable int not null default 0,
  stop_sell boolean not null default false,
  min_stay int,
  max_stay int,
  cta boolean not null default false,
  ctd boolean not null default false,
  primary key (property_id, room_type_id, stay_date)
);

create table if not exists mc_rates_daily (
  property_id text not null references mc_properties(id) on delete cascade,
  room_type_id text not null references mc_room_types(id) on delete cascade,
  rate_plan_id text not null references mc_rate_plans(id) on delete cascade,
  stay_date date not null,
  amount numeric(12,2) not null default 0,
  currency text,
  primary key (property_id, room_type_id, rate_plan_id, stay_date)
);

create table if not exists mc_channels (
  id text primary key,
  code text not null unique,
  name text not null,
  type text not null,
  status text not null default 'available',
  connection_method text,
  capabilities jsonb not null default '{}'::jsonb
);

create table if not exists mc_channel_connections (
  id text primary key,
  property_id text not null references mc_properties(id) on delete cascade,
  channel_id text not null references mc_channels(id),
  external_property_id text,
  status text not null default 'disconnected',
  -- encrypted blob only; never store raw API secrets here from the app without encryption
  credentials_enc text,
  last_success_at timestamptz,
  last_failure_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (property_id, channel_id)
);

create table if not exists mc_sync_jobs (
  id text primary key,
  property_id text not null references mc_properties(id) on delete cascade,
  channel_id text references mc_channels(id),
  type text not null,
  status text not null default 'queued',
  priority int not null default 100,
  attempt_count int not null default 0,
  next_retry_at timestamptz,
  error_message text,
  payload jsonb,
  result jsonb,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz
);
create index if not exists mc_sync_jobs_status_idx on mc_sync_jobs(status, priority, created_at);

-- Starter RLS (enable only after auth model is wired)
alter table mc_organizations enable row level security;
alter table mc_properties enable row level security;
alter table mc_room_types enable row level security;
alter table mc_rate_plans enable row level security;
alter table mc_inventory_daily enable row level security;
alter table mc_rates_daily enable row level security;
alter table mc_channel_connections enable row level security;
alter table mc_sync_jobs enable row level security;
