create table if not exists public.native_push_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  expo_push_token text not null,
  platform text not null default 'android',
  device_name text null,
  app_version text null,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  last_seen_at timestamp with time zone not null default now(),
  constraint native_push_tokens_platform_check check (platform in ('android')),
  unique (user_id, expo_push_token)
);

create index if not exists native_push_tokens_user_id_idx
  on public.native_push_tokens(user_id);

create index if not exists native_push_tokens_last_seen_at_idx
  on public.native_push_tokens(last_seen_at desc);

create or replace function public.touch_native_push_tokens_updated_at()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.updated_at = now();
  new.last_seen_at = now();
  return new;
end;
$$;

drop trigger if exists native_push_tokens_touch_updated_at on public.native_push_tokens;
create trigger native_push_tokens_touch_updated_at
  before update on public.native_push_tokens
  for each row
  execute function public.touch_native_push_tokens_updated_at();

alter table public.native_push_tokens enable row level security;

drop policy if exists "Users can view their own native push tokens" on public.native_push_tokens;
create policy "Users can view their own native push tokens"
  on public.native_push_tokens
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Users can insert their own native push tokens" on public.native_push_tokens;
create policy "Users can insert their own native push tokens"
  on public.native_push_tokens
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "Users can update their own native push tokens" on public.native_push_tokens;
create policy "Users can update their own native push tokens"
  on public.native_push_tokens
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can delete their own native push tokens" on public.native_push_tokens;
create policy "Users can delete their own native push tokens"
  on public.native_push_tokens
  for delete
  to authenticated
  using (auth.uid() = user_id);

create table if not exists public.native_push_delivery_attempts (
  id uuid primary key default gen_random_uuid(),
  notification_id uuid not null references public.notifications(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  native_push_token_id uuid null references public.native_push_tokens(id) on delete set null,
  token_hash text not null,
  status text not null,
  http_status integer null,
  error_message text null,
  expo_ticket_id text null,
  created_at timestamp with time zone not null default now(),
  constraint native_push_delivery_attempts_status_check
    check (status in ('ticket_accepted', 'stale_token', 'failed'))
);

create index if not exists native_push_delivery_attempts_notification_id_idx
  on public.native_push_delivery_attempts(notification_id);

create index if not exists native_push_delivery_attempts_user_created_at_idx
  on public.native_push_delivery_attempts(user_id, created_at desc);

create index if not exists native_push_delivery_attempts_token_created_at_idx
  on public.native_push_delivery_attempts(native_push_token_id, created_at desc);

alter table public.native_push_delivery_attempts enable row level security;

comment on table public.native_push_tokens is
  'Native Android Expo push tokens per user/device. Web Push subscriptions stay in public.push_subscriptions.';

comment on table public.native_push_delivery_attempts is
  'Service-role diagnostics for native Expo Push delivery attempts. Stores token hashes, not raw Expo push tokens.';

revoke execute on function public.touch_native_push_tokens_updated_at() from public, anon, authenticated;
