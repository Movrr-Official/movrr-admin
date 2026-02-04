-- Audit logs table + policies for Movrr admin dashboard
-- Creates: public.audit_log, admin check function, insert helper, indexes

-- 2) Audit log table
create table if not exists public.audit_log (
  id uuid primary key default gen_random_uuid(),
  action text not null,
  result text,
  performed_by jsonb not null,
  affected_entity jsonb,
  timestamp timestamptz not null default now(),
  source_ip text,
  geo_location jsonb,
  user_agent text,
  resource_id text,
  metadata jsonb,
  created_at timestamptz not null default now()
);

-- 3) Indexes
create index if not exists audit_log_timestamp_idx
  on public.audit_log (timestamp desc);

create index if not exists audit_log_action_idx
  on public.audit_log (action);

create index if not exists audit_log_performed_by_gin
  on public.audit_log using gin (performed_by);

create index if not exists audit_log_affected_entity_gin
  on public.audit_log using gin (affected_entity);

-- 4) RLS
alter table public.audit_log enable row level security;

drop policy if exists "Admins can read audit logs" on public.audit_log;
create policy "Admins can read audit logs"
  on public.audit_log
  for select
  using (public.is_admin());

drop policy if exists "Admins can insert audit logs" on public.audit_log;
create policy "Admins can insert audit logs"
  on public.audit_log
  for insert
  with check (public.is_admin());

-- 5) Insert helper (optional, for server-side logging)
create or replace function public.create_audit_log(
  p_action text,
  p_result text,
  p_performed_by jsonb,
  p_affected_entity jsonb default null,
  p_source_ip text default null,
  p_geo_location jsonb default null,
  p_user_agent text default null,
  p_resource_id text default null,
  p_metadata jsonb default null,
  p_timestamp timestamptz default now()
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  insert into public.audit_log (
    action,
    result,
    performed_by,
    affected_entity,
    timestamp,
    source_ip,
    geo_location,
    user_agent,
    resource_id,
    metadata
  ) values (
    p_action,
    p_result,
    p_performed_by,
    p_affected_entity,
    p_timestamp,
    p_source_ip,
    p_geo_location,
    p_user_agent,
    p_resource_id,
    p_metadata
  )
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.create_audit_log(
  text,
  text,
  jsonb,
  jsonb,
  text,
  jsonb,
  text,
  text,
  jsonb,
  timestamptz
) from public;

grant execute on function public.create_audit_log(
  text,
  text,
  jsonb,
  jsonb,
  text,
  jsonb,
  text,
  text,
  jsonb,
  timestamptz
) to authenticated;