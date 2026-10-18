-- Additive migration for System administrator, appearance, and official announcements.
-- Run once after 20261017000000_folder_locker_community.sql.

alter table public.community_users
  add column if not exists role text not null default 'user' check (role in ('user','admin')),
  add column if not exists display_name_color text not null default '#e9faff' check (display_name_color ~ '^#[0-9A-Fa-f]{6}$'),
  add column if not exists badge text check (badge is null or char_length(badge) <= 18);

create table if not exists public.community_announcements (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.community_users(id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 100),
  body text not null check (char_length(btrim(body)) between 1 and 2000),
  created_at timestamptz not null default now()
);
create index if not exists community_announcements_created_idx
  on public.community_announcements(created_at desc, id desc);

alter table public.community_announcements enable row level security;
revoke all on public.community_announcements from anon, authenticated;
grant all on public.community_announcements to service_role;

-- Do not promote an account based only on its username. The backend's one-time
-- bootstrap action creates the first admin only after checking SYSTEM_SETUP_SECRET.
