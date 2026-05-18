create extension if not exists pg_net;
create extension if not exists pg_cron;
create extension if not exists supabase_vault with schema vault;

create or replace function public.enqueue_notification_push()
returns trigger
language plpgsql
security definer
set search_path = public, extensions, net, vault
as $$
declare
  webhook_secret text;
  edge_function_jwt text;
  request_headers jsonb := '{"Content-Type": "application/json"}'::jsonb;
begin
  begin
    select decrypted_secret
    into webhook_secret
    from vault.decrypted_secrets
    where name = 'beerva_push_webhook_secret'
    limit 1;
  exception
    when invalid_schema_name or undefined_table or insufficient_privilege then
      webhook_secret := null;
  end;

  begin
    select decrypted_secret
    into edge_function_jwt
    from vault.decrypted_secrets
    where name = 'beerva_edge_function_jwt'
    limit 1;
  exception
    when invalid_schema_name or undefined_table or insufficient_privilege then
      edge_function_jwt := null;
  end;

  if nullif(btrim(coalesce(edge_function_jwt, '')), '') is not null then
    request_headers := request_headers || jsonb_build_object(
      'Authorization',
      'Bearer ' || edge_function_jwt
    );
  end if;

  if nullif(btrim(coalesce(webhook_secret, '')), '') is not null then
    request_headers := request_headers || jsonb_build_object(
      'x-beerva-webhook-secret',
      webhook_secret
    );
  end if;

  perform net.http_post(
    url := 'https://yzrfihijpusvjypypnip.supabase.co/functions/v1/send-push',
    body := jsonb_build_object(
      'type', 'INSERT',
      'table', 'notifications',
      'schema', 'public',
      'record', to_jsonb(new),
      'old_record', null
    ),
    headers := request_headers,
    timeout_milliseconds := 5000
  );

  return new;
end;
$$;

drop trigger if exists notifications_send_push_after_insert on public.notifications;
create trigger notifications_send_push_after_insert
  after insert on public.notifications
  for each row
  execute function public.enqueue_notification_push();

create or replace function public.invoke_hangover_prompt_sender()
returns void
language plpgsql
security definer
set search_path = public, extensions, net, vault
as $$
declare
  cron_secret text;
  edge_function_jwt text;
  request_headers jsonb := '{"Content-Type": "application/json"}'::jsonb;
begin
  begin
    select decrypted_secret
    into cron_secret
    from vault.decrypted_secrets
    where name = 'beerva_hangover_cron_secret'
    limit 1;
  exception
    when invalid_schema_name or undefined_table or insufficient_privilege then
      cron_secret := null;
  end;

  begin
    select decrypted_secret
    into edge_function_jwt
    from vault.decrypted_secrets
    where name = 'beerva_edge_function_jwt'
    limit 1;
  exception
    when invalid_schema_name or undefined_table or insufficient_privilege then
      edge_function_jwt := null;
  end;

  if nullif(btrim(coalesce(edge_function_jwt, '')), '') is not null then
    request_headers := request_headers || jsonb_build_object(
      'Authorization',
      'Bearer ' || edge_function_jwt
    );
  end if;

  if nullif(btrim(coalesce(cron_secret, '')), '') is not null then
    request_headers := request_headers || jsonb_build_object(
      'x-beerva-cron-secret',
      cron_secret
    );
  end if;

  perform net.http_post(
    url := 'https://yzrfihijpusvjypypnip.supabase.co/functions/v1/send-hangover-prompts',
    body := '{}'::jsonb,
    headers := request_headers,
    timeout_milliseconds := 10000
  );
end;
$$;

do $$
begin
  if exists (
    select 1
    from cron.job
    where jobname = 'beerva-send-hangover-prompts'
  ) then
    perform cron.unschedule('beerva-send-hangover-prompts');
  end if;

  perform cron.schedule(
    'beerva-send-hangover-prompts',
    '*/5 * * * *',
    $job$select public.invoke_hangover_prompt_sender();$job$
  );
end;
$$;

create or replace function public.create_user_pub(
  target_name text,
  target_lat double precision default null,
  target_lon double precision default null,
  target_place_category text default 'pub'
)
returns table (
  id uuid,
  name text,
  city text,
  address text,
  latitude double precision,
  longitude double precision,
  source text,
  source_id text,
  use_count integer,
  place_category text,
  distance_meters double precision
)
language plpgsql
security definer
set search_path = public
as $$
declare
  requesting_user_id uuid := auth.uid();
  clean_name text := nullif(btrim(coalesce(target_name, '')), '');
  clean_place_category text := coalesce(nullif(btrim(coalesce(target_place_category, '')), ''), 'pub');
  created_pub public.pubs%rowtype;
begin
  if requesting_user_id is null then
    raise exception 'Not authenticated';
  end if;

  if clean_name is null or char_length(clean_name) < 2 or char_length(clean_name) > 120 then
    raise exception 'Pub name is too short.';
  end if;

  if clean_place_category not in ('pub', 'other') then
    raise exception 'Unknown place category.';
  end if;

  insert into public.pubs (
    name,
    latitude,
    longitude,
    source,
    status,
    created_by,
    place_category
  )
  values (
    clean_name,
    target_lat,
    target_lon,
    'user',
    'active',
    requesting_user_id,
    clean_place_category
  )
  returning * into created_pub;

  return query
  select
    created_pub.id,
    created_pub.name,
    created_pub.city,
    created_pub.address,
    created_pub.latitude,
    created_pub.longitude,
    created_pub.source,
    created_pub.source_id,
    created_pub.use_count,
    created_pub.place_category,
    null::double precision as distance_meters;
end;
$$;

revoke execute on function public.create_user_pub(text, double precision, double precision, text) from public, anon;
grant execute on function public.create_user_pub(text, double precision, double precision, text) to authenticated;

comment on function public.enqueue_notification_push() is 'Queues the send-push Edge Function after notifications are inserted. Uses x-beerva-webhook-secret for app-level verification and optional beerva_edge_function_jwt Vault secret for Supabase Edge gateway auth.';
comment on function public.invoke_hangover_prompt_sender() is 'Cron target that invokes send-hangover-prompts with Vault-backed cron and optional Edge gateway auth secrets.';
comment on function public.create_user_pub(text, double precision, double precision, text) is 'Creates a user-added drinking place while preserving its pub/other category even when REST schema cache is stale.';
