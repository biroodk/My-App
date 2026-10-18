-- Serialize first-time System administrator setup in one database transaction.
-- Apply after 20261018000000_folder_locker_system_admin.sql.

create or replace function public.community_bootstrap_system(
  p_password_salt text,
  p_password_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  system_user public.community_users;
begin
  -- All setup calls use the same transaction-scoped lock.
  perform pg_advisory_xact_lock(20261019, 1);

  if exists (select 1 from public.community_users where role = 'admin') then
    return jsonb_build_object(
      'status', 409,
      'error', 'System administrator setup has already been completed.'
    );
  end if;

  -- If a normal account named "system" already exists, safely promote/reset it.
  insert into public.community_users (
    username, username_lower, password_salt, password_hash,
    role, display_name_color, badge
  ) values (
    'System', 'system', p_password_salt, p_password_hash,
    'admin', '#1ce3ff', 'Owner'
  )
  on conflict (username_lower) do update set
    username = excluded.username,
    password_salt = excluded.password_salt,
    password_hash = excluded.password_hash,
    role = excluded.role,
    display_name_color = excluded.display_name_color,
    badge = excluded.badge
  returning * into system_user;

  return jsonb_build_object('status', 201, 'user', to_jsonb(system_user));
end;
$$;

revoke all on function public.community_bootstrap_system(text, text) from public, anon, authenticated;
grant execute on function public.community_bootstrap_system(text, text) to service_role;
