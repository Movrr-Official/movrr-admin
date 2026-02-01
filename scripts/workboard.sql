-- Workboard (Kanban) schema for MOVRR admin

create extension if not exists pgcrypto;

create sequence if not exists public.workboard_card_seq;

-- Enum types (create only if missing)
do $$
begin
  if not exists (select 1 from pg_type where typname = 'workboard_member_role') then
    create type public.workboard_member_role as enum ('owner', 'admin', 'editor', 'viewer');
  end if;
  if not exists (select 1 from pg_type where typname = 'workboard_status') then
    create type public.workboard_status as enum ('active', 'inactive');
  end if;
  if not exists (select 1 from pg_type where typname = 'workboard_tone') then
    create type public.workboard_tone as enum ('slate', 'indigo', 'emerald', 'amber');
  end if;
  if not exists (select 1 from pg_type where typname = 'workboard_card_type') then
    create type public.workboard_card_type as enum ('Engineering', 'Operations', 'Campaign', 'Product', 'Growth');
  end if;
  if not exists (select 1 from pg_type where typname = 'workboard_card_priority') then
    create type public.workboard_card_priority as enum ('Low', 'Medium', 'High', 'Critical');
  end if;
end
$$;

-- Tables
create table if not exists public.workboard_teams (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.workboard_team_members (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.workboard_teams(id) on delete cascade,
  user_id uuid not null,
  role public.workboard_member_role not null,
  status public.workboard_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (team_id, user_id)
);

create table if not exists public.workboard_invites (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.workboard_teams(id) on delete cascade,
  email text not null,
  role public.workboard_member_role not null,
  token text not null unique,
  invited_by uuid not null,
  accepted_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.workboard_boards (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.workboard_teams(id) on delete cascade,
  title text not null,
  helper text,
  tone public.workboard_tone not null,
  status_key text not null,
  position integer not null default 0,
  archived_at timestamptz,
  created_by uuid not null,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (team_id, status_key)
);

create table if not exists public.workboard_cards (
  id uuid primary key default gen_random_uuid(),
  card_number bigint not null default nextval('public.workboard_card_seq'),
  card_reference text generated always as ('MOVRR-' || card_number) stored,
  team_id uuid not null references public.workboard_teams(id) on delete cascade,
  board_id uuid not null references public.workboard_boards(id) on delete cascade,
  title text not null,
  description text,
  type public.workboard_card_type not null,
  priority public.workboard_card_priority not null,
  due_date date,
  effort text,
  position integer not null default 0,
  archived_at timestamptz,
  created_by uuid not null,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (card_reference)
);

-- Helper functions
create or replace function public.is_workboard_member(team uuid)
returns boolean
language sql
stable
as $$
  select exists (
    select 1 from public.workboard_team_members m
    where m.team_id = team
      and m.user_id = auth.uid()
      and m.status = 'active'
  );
$$;

create or replace function public.workboard_role(team uuid)
returns text
language sql
stable
as $$
  select m.role::text
  from public.workboard_team_members m
  where m.team_id = team
    and m.user_id = auth.uid()
    and m.status = 'active'
  limit 1;
$$;

create or replace function public.is_workboard_admin(team uuid)
returns boolean
language sql
stable
as $$
  select coalesce(public.workboard_role(team) in ('owner','admin'), false);
$$;

create or replace function public.is_workboard_editor(team uuid)
returns boolean
language sql
stable
as $$
  select coalesce(public.workboard_role(team) in ('owner','admin','editor'), false);
$$;

-- Enable RLS
alter table public.workboard_teams enable row level security;
alter table public.workboard_team_members enable row level security;
alter table public.workboard_invites enable row level security;
alter table public.workboard_boards enable row level security;
alter table public.workboard_cards enable row level security;

-- Policies (Postgres does not support IF NOT EXISTS for CREATE POLICY)
-- Drop a policy first if you want idempotency, or just CREATE (will fail if policy exists).
-- I will DROP policies if they exist, then CREATE them to be idempotent.

-- Workboard teams policies
drop policy if exists workboard_teams_select on public.workboard_teams;
create policy workboard_teams_select on public.workboard_teams
  for select
  using (public.is_workboard_member(id));

drop policy if exists workboard_teams_insert on public.workboard_teams;
create policy workboard_teams_insert on public.workboard_teams
  for insert
  with check (
    exists (select 1 from public.admin_users au where au.user_id = auth.uid())
  );

drop policy if exists workboard_teams_update on public.workboard_teams;
create policy workboard_teams_update on public.workboard_teams
  for update
  using (public.is_workboard_admin(id));

-- Team members policies
drop policy if exists workboard_members_select on public.workboard_team_members;
create policy workboard_members_select on public.workboard_team_members
  for select
  using (public.is_workboard_member(team_id));

drop policy if exists workboard_members_insert on public.workboard_team_members;
create policy workboard_members_insert on public.workboard_team_members
  for insert
  with check (public.is_workboard_admin(team_id));

drop policy if exists workboard_members_update on public.workboard_team_members;
create policy workboard_members_update on public.workboard_team_members
  for update
  using (public.is_workboard_admin(team_id));

drop policy if exists workboard_members_delete on public.workboard_team_members;
create policy workboard_members_delete on public.workboard_team_members
  for delete
  using (public.is_workboard_admin(team_id));

-- Invites policies
drop policy if exists workboard_invites_select on public.workboard_invites;
create policy workboard_invites_select on public.workboard_invites
  for select
  using (public.is_workboard_admin(team_id));

drop policy if exists workboard_invites_insert on public.workboard_invites;
create policy workboard_invites_insert on public.workboard_invites
  for insert
  with check (public.is_workboard_admin(team_id));

drop policy if exists workboard_invites_update on public.workboard_invites;
create policy workboard_invites_update on public.workboard_invites
  for update
  using (public.is_workboard_admin(team_id));

-- Boards policies
drop policy if exists workboard_boards_select on public.workboard_boards;
create policy workboard_boards_select on public.workboard_boards
  for select
  using (public.is_workboard_member(team_id));

drop policy if exists workboard_boards_insert on public.workboard_boards;
create policy workboard_boards_insert on public.workboard_boards
  for insert
  with check (public.is_workboard_admin(team_id));

drop policy if exists workboard_boards_update on public.workboard_boards;
create policy workboard_boards_update on public.workboard_boards
  for update
  using (public.is_workboard_admin(team_id));

drop policy if exists workboard_boards_delete on public.workboard_boards;
create policy workboard_boards_delete on public.workboard_boards
  for delete
  using (public.is_workboard_admin(team_id));

-- Cards policies
drop policy if exists workboard_cards_select on public.workboard_cards;
create policy workboard_cards_select on public.workboard_cards
  for select
  using (public.is_workboard_member(team_id));

drop policy if exists workboard_cards_insert on public.workboard_cards;
create policy workboard_cards_insert on public.workboard_cards
  for insert
  with check (public.is_workboard_editor(team_id));

drop policy if exists workboard_cards_update on public.workboard_cards;
create policy workboard_cards_update on public.workboard_cards
  for update
  using (public.is_workboard_editor(team_id));

drop policy if exists workboard_cards_delete on public.workboard_cards;
create policy workboard_cards_delete on public.workboard_cards
  for delete
  using (public.is_workboard_admin(team_id));