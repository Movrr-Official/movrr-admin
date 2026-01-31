-- Create route stops table for strategic stops
create table if not exists public.route_stop (
  id uuid primary key default gen_random_uuid(),
  route_id uuid not null references public.route(id) on delete cascade,
  name text not null,
  lat double precision not null,
  lng double precision not null,
  stop_order integer not null default 0,
  notes text,
  created_at timestamp with time zone not null default now()
);

create index if not exists idx_route_stop_route_id on public.route_stop (route_id);
create index if not exists idx_route_stop_order on public.route_stop (route_id, stop_order);

-- Enforce stop locations to be inside a campaign zone (requires PostGIS)
create extension if not exists postgis;

create or replace function public.validate_route_stop_in_campaign_zone()
returns trigger as $$
declare
  route_campaign_id uuid;
  is_inside boolean;
begin
  select campaign_id into route_campaign_id
  from public.route
  where id = new.route_id;

  if route_campaign_id is null then
    raise exception 'Route % must be attached to a campaign before adding stops', new.route_id;
  end if;

  select exists (
    select 1
    from public.campaign_zone cz
    where cz.campaign_id = route_campaign_id
      and st_contains(
        cz.geom,
        st_setsrid(st_point(new.lng, new.lat), 4326)
      )
  ) into is_inside;

  if not is_inside then
    raise exception 'Stop must be inside a campaign zone for campaign %', route_campaign_id;
  end if;

  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_validate_route_stop_in_campaign_zone on public.route_stop;

create trigger trg_validate_route_stop_in_campaign_zone
before insert or update on public.route_stop
for each row execute function public.validate_route_stop_in_campaign_zone();
