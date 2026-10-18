-- Folder Locker community database (Supabase PostgreSQL)
-- Run this file once in Supabase Dashboard -> SQL Editor.

create extension if not exists pgcrypto;

create table if not exists public.community_users (
  id uuid primary key default gen_random_uuid(),
  username text not null check (char_length(username) between 3 and 24),
  username_lower text not null unique,
  password_salt text not null,
  password_hash text not null,
  avatar_url text,
  created_at timestamptz not null default now()
);
create unique index if not exists community_users_username_lower_uidx
  on public.community_users (username_lower);

create table if not exists public.community_sessions (
  token_hash text primary key,
  user_id uuid not null references public.community_users(id) on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index if not exists community_sessions_user_idx on public.community_sessions(user_id);
create index if not exists community_sessions_expiry_idx on public.community_sessions(expires_at);

create table if not exists public.community_posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.community_users(id) on delete cascade,
  text text not null check (char_length(btrim(text)) between 1 and 1200),
  created_at timestamptz not null default now(),
  updated_at timestamptz
);
create index if not exists community_posts_created_idx on public.community_posts(created_at desc, id desc);
create index if not exists community_posts_author_idx on public.community_posts(author_id);

create table if not exists public.community_likes (
  post_id uuid not null references public.community_posts(id) on delete cascade,
  user_id uuid not null references public.community_users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

create table if not exists public.community_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.community_posts(id) on delete cascade,
  author_id uuid not null references public.community_users(id) on delete cascade,
  text text not null check (char_length(btrim(text)) between 1 and 700),
  created_at timestamptz not null default now()
);
create index if not exists community_comments_post_idx on public.community_comments(post_id, created_at);

create table if not exists public.community_replies (
  id uuid primary key default gen_random_uuid(),
  comment_id uuid not null references public.community_comments(id) on delete cascade,
  author_id uuid not null references public.community_users(id) on delete cascade,
  text text not null check (char_length(btrim(text)) between 1 and 500),
  created_at timestamptz not null default now()
);
create index if not exists community_replies_comment_idx on public.community_replies(comment_id, created_at);

-- Like/unlike is one PostgreSQL transaction, so concurrent taps cannot create duplicate likes.
create or replace function public.community_toggle_like(p_post_id uuid, p_user_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.community_posts where id = p_post_id) then
    raise exception 'Post not found';
  end if;
  if exists (select 1 from public.community_likes where post_id = p_post_id and user_id = p_user_id) then
    delete from public.community_likes where post_id = p_post_id and user_id = p_user_id;
    return false;
  else
    insert into public.community_likes(post_id, user_id) values (p_post_id, p_user_id)
    on conflict (post_id, user_id) do nothing;
    return true;
  end if;
end;
$$;

-- Only the Netlify function's service-role key may access community tables/functions.
alter table public.community_users enable row level security;
alter table public.community_sessions enable row level security;
alter table public.community_posts enable row level security;
alter table public.community_likes enable row level security;
alter table public.community_comments enable row level security;
alter table public.community_replies enable row level security;

revoke all on public.community_users, public.community_sessions, public.community_posts,
  public.community_likes, public.community_comments, public.community_replies from anon, authenticated;
grant all on public.community_users, public.community_sessions, public.community_posts,
  public.community_likes, public.community_comments, public.community_replies to service_role;
revoke all on function public.community_toggle_like(uuid, uuid) from public, anon, authenticated;
grant execute on function public.community_toggle_like(uuid, uuid) to service_role;

-- Profile images are public to display next to posts, but only the backend signs uploads.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('community-avatars', 'community-avatars', true, 6291456,
        array['image/jpeg','image/png','image/webp','image/gif'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
