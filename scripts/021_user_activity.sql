-- Canonical user activity stream for dashboard activity, timelines, and last-active signals.

begin;

create table if not exists public.user_activity (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public."user"(id) on delete cascade,
  actor_user_id uuid null references public."user"(id) on delete set null,
  source text not null,
  action text not null,
  description text not null,
  related_entity_type text null,
  related_entity_id text null,
  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists idx_user_activity_user_occurred_at
  on public.user_activity (user_id, occurred_at desc);

create index if not exists idx_user_activity_source
  on public.user_activity (source);

create index if not exists idx_user_activity_related_entity
  on public.user_activity (related_entity_type, related_entity_id);

create index if not exists idx_user_activity_metadata_gin
  on public.user_activity using gin (metadata);

commit;
