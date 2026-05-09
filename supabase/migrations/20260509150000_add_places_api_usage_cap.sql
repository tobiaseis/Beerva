create table if not exists public.places_api_usage (
  provider text not null,
  month_start date not null,
  call_count integer not null default 0,
  monthly_limit integer not null default 450,
  updated_at timestamp with time zone not null default now(),
  primary key (provider, month_start),
  constraint places_api_usage_provider_length check (char_length(btrim(provider)) between 2 and 40),
  constraint places_api_usage_call_count_check check (call_count >= 0),
  constraint places_api_usage_monthly_limit_check check (monthly_limit >= 0)
);

alter table public.places_api_usage enable row level security;

create or replace function public.reserve_places_api_call(
  provider_name text,
  provider_monthly_limit integer default 450
)
returns table (
  allowed boolean,
  call_count integer,
  monthly_limit integer,
  month_start date
)
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_provider text := lower(btrim(provider_name));
  current_month date := date_trunc('month', now())::date;
  reserved_record public.places_api_usage%rowtype;
begin
  if normalized_provider is null or normalized_provider = '' then
    raise exception 'provider_name is required';
  end if;

  insert into public.places_api_usage as usage (
    provider,
    month_start,
    call_count,
    monthly_limit,
    updated_at
  )
  values (
    normalized_provider,
    current_month,
    0,
    greatest(coalesce(provider_monthly_limit, 450), 0),
    now()
  )
  on conflict (provider, month_start) do update
    set monthly_limit = excluded.monthly_limit,
        updated_at = now();

  update public.places_api_usage as usage
  set call_count = usage.call_count + 1,
      monthly_limit = greatest(coalesce(provider_monthly_limit, 450), 0),
      updated_at = now()
  where usage.provider = normalized_provider
    and usage.month_start = current_month
    and usage.call_count < greatest(coalesce(provider_monthly_limit, 450), 0)
  returning usage.*
  into reserved_record;

  if found then
    allowed := true;
    call_count := reserved_record.call_count;
    monthly_limit := reserved_record.monthly_limit;
    month_start := reserved_record.month_start;
    return next;
    return;
  end if;

  select usage.*
  into reserved_record
  from public.places_api_usage as usage
  where usage.provider = normalized_provider
    and usage.month_start = current_month;

  allowed := false;
  call_count := coalesce(reserved_record.call_count, 0);
  monthly_limit := coalesce(reserved_record.monthly_limit, greatest(coalesce(provider_monthly_limit, 450), 0));
  month_start := current_month;
  return next;
end;
$$;

comment on table public.places_api_usage is 'Monthly call counters for paid/free external places APIs.';
comment on function public.reserve_places_api_call(text, integer) is 'Atomically reserves one external places API call if the provider is still below the monthly cap.';
