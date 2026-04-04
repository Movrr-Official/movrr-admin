-- Migration 028: Ensure admin and super_admin accounts exist in public.user

begin;

insert into public."user" (
  id,
  email,
  name,
  role,
  status,
  created_at,
  updated_at,
  email_verified,
  is_verified,
  language_preference
)
select
  au.user_id as id,
  coalesce(au.email, auth_u.email) as email,
  coalesce(
    nullif(trim(auth_u.raw_user_meta_data->>'full_name'), ''),
    nullif(trim(concat(
      coalesce(auth_u.raw_user_meta_data->>'first_name', ''),
      ' ',
      coalesce(auth_u.raw_user_meta_data->>'last_name', '')
    )), ''),
    split_part(coalesce(au.email, auth_u.email, 'Admin User'), '@', 1),
    'Admin User'
  ) as name,
  case
    when au.role = 'super_admin' then 'super_admin'::user_role
    else 'admin'::user_role
  end as role,
  'active'::user_status as status,
  coalesce(auth_u.created_at, now()) as created_at,
  now() as updated_at,
  coalesce(auth_u.email_confirmed_at is not null, false) as email_verified,
  coalesce(auth_u.email_confirmed_at is not null, false) as is_verified,
  coalesce(nullif(auth_u.raw_user_meta_data->>'language', ''), 'en') as language_preference
from public.admin_users au
join auth.users auth_u
  on auth_u.id = au.user_id
left join public."user" pu
  on pu.id = au.user_id
where pu.id is null
  and au.role in ('admin', 'super_admin');

commit;
