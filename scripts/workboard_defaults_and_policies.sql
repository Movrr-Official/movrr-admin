create or replace function workboard_is_member(_team_id uuid)
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from workboard_team_members
    where team_id = _team_id
      and user_id = auth.uid()
      and status = 'active'
  );
$$;

create or replace function workboard_is_editor(_team_id uuid)
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from workboard_team_members
    where team_id = _team_id
      and user_id = auth.uid()
      and status = 'active'
      and role in ('owner','admin','editor')
  );
$$;

create or replace function workboard_is_admin(_team_id uuid)
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from workboard_team_members
    where team_id = _team_id
      and user_id = auth.uid()
      and status = 'active'
      and role in ('owner','admin')
  );
$$;

alter table workboard_teams enable row level security;
alter table workboard_team_members enable row level security;
alter table workboard_boards enable row level security;
alter table workboard_cards enable row level security;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'workboard_boards'
      AND policyname = 'workboard_boards_select'
  ) THEN
    create policy workboard_boards_select
      on workboard_boards
      for select
      using (workboard_is_member(team_id));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'workboard_boards'
      AND policyname = 'workboard_boards_insert'
  ) THEN
    create policy workboard_boards_insert
      on workboard_boards
      for insert
      with check (workboard_is_editor(team_id));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'workboard_boards'
      AND policyname = 'workboard_boards_update'
  ) THEN
    create policy workboard_boards_update
      on workboard_boards
      for update
      using (workboard_is_editor(team_id))
      with check (workboard_is_editor(team_id));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'workboard_boards'
      AND policyname = 'workboard_boards_delete'
  ) THEN
    create policy workboard_boards_delete
      on workboard_boards
      for delete
      using (workboard_is_admin(team_id));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'workboard_cards'
      AND policyname = 'workboard_cards_select'
  ) THEN
    create policy workboard_cards_select
      on workboard_cards
      for select
      using (workboard_is_member(team_id));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'workboard_cards'
      AND policyname = 'workboard_cards_insert'
  ) THEN
    create policy workboard_cards_insert
      on workboard_cards
      for insert
      with check (workboard_is_editor(team_id));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'workboard_cards'
      AND policyname = 'workboard_cards_update'
  ) THEN
    create policy workboard_cards_update
      on workboard_cards
      for update
      using (workboard_is_editor(team_id))
      with check (workboard_is_editor(team_id));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'workboard_cards'
      AND policyname = 'workboard_cards_delete'
  ) THEN
    create policy workboard_cards_delete
      on workboard_cards
      for delete
      using (workboard_is_admin(team_id));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'workboard_team_members'
      AND policyname = 'workboard_team_members_select'
  ) THEN
    create policy workboard_team_members_select
      on workboard_team_members
      for select
      using (workboard_is_member(team_id));
  END IF;
END $$;
