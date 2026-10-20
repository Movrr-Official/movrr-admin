CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  _role public.user_role := 'rider';
  _user_id uuid := new.id;
  _lang text := 'en';
  _tz text := 'UTC';
  _meta jsonb := coalesce(new.raw_user_meta_data::jsonb, '{}'::jsonb);
  _name text;
  _avatar text;
  _company_name text;
begin
  -- Only trust server-assigned role.
  if (_meta ? 'server_assigned_role') then
    begin
      _role := (_meta->>'server_assigned_role')::public.user_role;
    exception
      when others then
        _role := 'rider';
    end;
  end if;

  _name := coalesce(nullif(_meta->>'full_name', ''), new.email, '');
  _avatar := coalesce(
    nullif(_meta->>'avatar_url', ''),
    nullif(_meta->>'avatarUrl', ''),
    nullif(_meta->>'avatarurl', '')
  );

  insert into public."user" (
    id,
    email,
    name,
    phone,
    organization,
    avatar_url,
    role,
    created_at,
    updated_at
  )
  values (
    new.id,
    new.email,
    _name,
    nullif(_meta->>'phone', ''),
    null,
    _avatar,
    _role,
    now(),
    now()
  )
  on conflict (id) do update
  set email = excluded.email,
      name = case
        when coalesce(public."user".name, '') = '' then excluded.name
        else public."user".name
      end,
      phone = coalesce(public."user".phone, excluded.phone),
      avatar_url = coalesce(public."user".avatar_url, excluded.avatar_url),
      role = public."user".role,
      updated_at = now();

  if _role = 'rider' then
    insert into public.rider (
      user_id,
      created_at,
      phone,
      city,
      country
    )
    values (
      _user_id,
      now(),
      nullif(_meta->>'phone', ''),
      nullif(_meta->>'city', ''),
      nullif(_meta->>'country', '')
    )
    on conflict (user_id) do update
    set phone = coalesce(public.rider.phone, excluded.phone),
        city = coalesce(public.rider.city, excluded.city),
        country = coalesce(public.rider.country, excluded.country);
  end if;

  if _role = 'advertiser' then
    _lang := coalesce(nullif(_meta->>'language', ''), 'en');
    _tz := coalesce(nullif(_meta->>'timezone', ''), 'UTC');
    _company_name := nullif(_meta->>'companyName', '');

    insert into public.advertiser (
      user_id,
      company_name,
      language,
      timezone,
      created_at
    )
    values (
      _user_id,
      _company_name,
      _lang,
      _tz,
      now()
    )
    on conflict (user_id) do update
    set company_name = coalesce(public.advertiser.company_name, excluded.company_name),
        language = coalesce(public.advertiser.language, excluded.language),
        timezone = coalesce(public.advertiser.timezone, excluded.timezone);
  end if;

  return null;
exception
  when others then
    raise log 'handle_new_user failed for auth.users.id=% email=% error=%',
      new.id, new.email, sqlerrm;
    raise;
end;
$function$
