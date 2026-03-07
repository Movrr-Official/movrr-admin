begin;

-- The shared auth.users trigger is used by admin-created users, advertisers,
-- waitlist approvals, and rider signups. Rider profile location fields cannot
-- be mandatory at trigger time unless every creation path guarantees them.
alter table public.rider
  alter column city drop not null;

alter table public.rider
  alter column country drop not null;

-- Ensure trigger upserts against a real unique key.
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'rider_user_id_key'
      and conrelid = 'public.rider'::regclass
  ) then
    alter table public.rider
      add constraint rider_user_id_key unique (user_id);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'advertiser_user_id_key'
      and conrelid = 'public.advertiser'::regclass
  ) then
    alter table public.advertiser
      add constraint advertiser_user_id_key unique (user_id);
  end if;
end $$;

commit;
