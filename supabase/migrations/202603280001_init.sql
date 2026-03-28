create extension if not exists pgcrypto;

create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  created_at timestamptz not null default now()
);

create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  unique(user_id, name)
);

create table if not exists public.feeds (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  category_id uuid references public.categories(id) on delete set null,
  feed_url text not null,
  site_url text,
  title text not null,
  description text,
  favicon_url text,
  custom_title text,
  health_status text not null default 'active' check (health_status in ('active', 'stale', 'error')),
  last_fetched_at timestamptz,
  last_successful_fetch_at timestamptz,
  last_http_status int,
  last_error text,
  etag text,
  last_modified text,
  consecutive_failures int not null default 0,
  next_fetch_at timestamptz not null default now(),
  refresh_interval_minutes int not null default 30,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, feed_url)
);

create table if not exists public.feed_items (
  id uuid primary key default gen_random_uuid(),
  feed_id uuid not null references public.feeds(id) on delete cascade,
  item_guid text not null,
  url text not null,
  title text not null,
  excerpt text,
  content_html text,
  author text,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  unique(feed_id, item_guid)
);

create table if not exists public.user_item_states (
  user_id uuid not null references auth.users(id) on delete cascade,
  feed_item_id uuid not null references public.feed_items(id) on delete cascade,
  is_read boolean not null default false,
  read_at timestamptz,
  is_bookmarked boolean not null default false,
  bookmarked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, feed_item_id)
);

create table if not exists public.user_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  layout_mode text not null default 'comfortable' check (layout_mode in ('compact', 'comfortable', 'cards', 'split')),
  refresh_interval_minutes int not null default 30,
  digest_last_viewed_at timestamptz,
  items_per_page int not null default 40,
  keyboard_shortcuts_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.feed_refresh_jobs (
  id bigserial primary key,
  feed_id uuid not null references public.feeds(id) on delete cascade,
  run_started_at timestamptz not null default now(),
  run_finished_at timestamptz,
  attempt int not null default 1,
  success boolean,
  http_status int,
  error_message text,
  next_retry_at timestamptz
);

create index if not exists idx_feeds_user_next_fetch on public.feeds(user_id, next_fetch_at);
create index if not exists idx_feeds_user_category on public.feeds(user_id, category_id);
create index if not exists idx_items_feed_published on public.feed_items(feed_id, published_at desc);
create index if not exists idx_item_states_user_read on public.user_item_states(user_id, is_read);
create index if not exists idx_item_states_user_bookmark on public.user_item_states(user_id, is_bookmarked);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists feeds_updated_at on public.feeds;
create trigger feeds_updated_at
before update on public.feeds
for each row execute function public.set_updated_at();

drop trigger if exists user_item_states_updated_at on public.user_item_states;
create trigger user_item_states_updated_at
before update on public.user_item_states
for each row execute function public.set_updated_at();

drop trigger if exists user_preferences_updated_at on public.user_preferences;
create trigger user_preferences_updated_at
before update on public.user_preferences
for each row execute function public.set_updated_at();

alter table public.profiles enable row level security;
alter table public.categories enable row level security;
alter table public.feeds enable row level security;
alter table public.feed_items enable row level security;
alter table public.user_item_states enable row level security;
alter table public.user_preferences enable row level security;
alter table public.feed_refresh_jobs enable row level security;

create policy "profiles_select_own" on public.profiles for select using (auth.uid() = user_id);
create policy "profiles_upsert_own" on public.profiles for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "categories_own" on public.categories for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "feeds_own" on public.feeds for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "feed_items_from_owned_feeds"
on public.feed_items
for select
using (
  exists (
    select 1 from public.feeds f where f.id = feed_id and f.user_id = auth.uid()
  )
);

create policy "feed_items_manage_from_owned_feeds"
on public.feed_items
for all
using (
  exists (
    select 1 from public.feeds f where f.id = feed_id and f.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from public.feeds f where f.id = feed_id and f.user_id = auth.uid()
  )
);

create policy "item_states_own" on public.user_item_states for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "preferences_own" on public.user_preferences for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "jobs_from_owned_feeds"
on public.feed_refresh_jobs
for select
using (
  exists (
    select 1 from public.feeds f where f.id = feed_id and f.user_id = auth.uid()
  )
);
