-- Folder Locker Community + public website statistics for Vercel.
-- Values are accessible only through the server-side service-role key; never expose that key in HTML.
create table if not exists public.folder_locker_kv (
  store text not null,
  key text not null,
  value jsonb not null,
  updated_at timestamptz not null default now(),
  constraint folder_locker_kv_pkey primary key (store, key)
);

create index if not exists folder_locker_kv_store_key_idx
  on public.folder_locker_kv (store, key);

alter table public.folder_locker_kv enable row level security;
revoke all on table public.folder_locker_kv from anon, authenticated;
grant all on table public.folder_locker_kv to service_role;

-- Avatars are stored privately; /api/community?avatar=... streams them through the server.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('community-avatars', 'community-avatars', false, 3145728,
        array['image/jpeg','image/png','image/webp','image/gif'])
on conflict (id) do update set public = false, file_size_limit = 3145728,
  allowed_mime_types = array['image/jpeg','image/png','image/webp','image/gif'];
