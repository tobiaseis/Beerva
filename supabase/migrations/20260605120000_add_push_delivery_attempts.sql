create table if not exists public.push_delivery_attempts (
  id uuid primary key default gen_random_uuid(),
  notification_id uuid not null references public.notifications(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  push_subscription_id uuid null references public.push_subscriptions(id) on delete set null,
  endpoint_hash text not null,
  status text not null,
  http_status integer null,
  error_message text null,
  created_at timestamp with time zone not null default now(),
  constraint push_delivery_attempts_status_check
    check (status in ('accepted', 'expired_subscription', 'failed'))
);

alter table public.push_delivery_attempts enable row level security;

create index if not exists push_delivery_attempts_notification_id_idx
  on public.push_delivery_attempts(notification_id);

create index if not exists push_delivery_attempts_user_created_at_idx
  on public.push_delivery_attempts(user_id, created_at desc);

create index if not exists push_delivery_attempts_subscription_created_at_idx
  on public.push_delivery_attempts(push_subscription_id, created_at desc);

comment on table public.push_delivery_attempts is 'Service-role diagnostics for Web Push delivery attempts. Stores endpoint hashes, not raw push endpoints.';
