create extension if not exists pg_cron;

create index if not exists sessions_active_started_at_idx
  on public.sessions ((coalesce(started_at, created_at)))
  where status = 'active';

create index if not exists pub_crawls_active_started_at_idx
  on public.pub_crawls ((coalesce(started_at, created_at)))
  where status = 'active';

drop function if exists public.close_stale_active_sessions(integer);

create or replace function public.close_stale_active_sessions(max_rows integer default 100)
returns table (
  published_sessions integer,
  cancelled_sessions integer,
  published_crawls integer,
  cancelled_crawls integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  cutoff_at timestamp with time zone := now() - interval '12 hours';
  now_value timestamp with time zone := now();
  row_limit integer := least(greatest(coalesce(max_rows, 100), 1), 500);
  crawl_row record;
  session_row record;
  drink_count integer;
begin
  published_sessions := 0;
  cancelled_sessions := 0;
  published_crawls := 0;
  cancelled_crawls := 0;

  for crawl_row in
    select c.id
    from public.pub_crawls c
    where c.status = 'active'
      and coalesce(c.started_at, c.created_at, now_value) <= cutoff_at
      and public.get_live_pub_crawl_last_activity(c.id) <= cutoff_at
    order by coalesce(c.started_at, c.created_at, now_value) asc
    limit row_limit
    for update skip locked
  loop
    select coalesce(sum(greatest(coalesce(sb.quantity, 1), 0)), 0)::integer
    into drink_count
    from public.sessions s
    join public.session_beers sb
      on sb.session_id = s.id
    where s.pub_crawl_id = crawl_row.id
      and s.is_crawl_stop = true
      and s.status in ('active', 'published');

    if drink_count <= 0 then
      update public.pub_crawls
      set status = 'cancelled',
          ended_at = now_value
      where id = crawl_row.id
        and status = 'active';

      if found then
        update public.sessions
        set status = 'cancelled',
            ended_at = coalesce(ended_at, now_value),
            hide_from_feed = true
        where pub_crawl_id = crawl_row.id;

        cancelled_crawls := cancelled_crawls + 1;
      end if;
    else
      update public.pubs
      set use_count = use_count + 1,
          updated_at = now_value
      where id in (
        select distinct s.pub_id
        from public.sessions s
        where s.pub_crawl_id = crawl_row.id
          and s.status = 'active'
          and s.is_crawl_stop = true
          and s.pub_id is not null
      )
        and status = 'active';

      update public.sessions
      set status = 'published',
          ended_at = now_value,
          published_at = now_value,
          hide_from_feed = true
      where pub_crawl_id = crawl_row.id
        and status = 'active'
        and is_crawl_stop = true;

      update public.sessions
      set hide_from_feed = true
      where pub_crawl_id = crawl_row.id
        and is_crawl_stop = true
        and hide_from_feed = false;

      update public.pub_crawls
      set status = 'published',
          ended_at = now_value,
          published_at = now_value
      where id = crawl_row.id
        and status = 'active';

      if found then
        published_crawls := published_crawls + 1;
      end if;
    end if;
  end loop;

  for session_row in
    select s.id, s.pub_id
    from public.sessions s
    where s.status = 'active'
      and s.pub_crawl_id is null
      and coalesce(s.started_at, s.created_at, now_value) <= cutoff_at
      and public.get_live_session_last_activity(s.id) <= cutoff_at
    order by coalesce(s.started_at, s.created_at, now_value) asc
    limit row_limit
    for update skip locked
  loop
    select coalesce(sum(greatest(coalesce(sb.quantity, 1), 0)), 0)::integer
    into drink_count
    from public.session_beers sb
    where sb.session_id = session_row.id;

    if drink_count <= 0 then
      update public.sessions
      set status = 'cancelled',
          ended_at = now_value
      where id = session_row.id
        and status = 'active';

      if found then
        cancelled_sessions := cancelled_sessions + 1;
      end if;
    else
      update public.sessions
      set status = 'published',
          ended_at = now_value,
          published_at = now_value
      where id = session_row.id
        and status = 'active';

      if found then
        update public.pubs
        set use_count = use_count + 1,
            updated_at = now_value
        where id = session_row.pub_id
          and status = 'active';

        published_sessions := published_sessions + 1;
      end if;
    end if;
  end loop;

  return next;
end;
$$;

create or replace function public.invoke_stale_session_closer()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform *
  from public.close_stale_active_sessions(100);
end;
$$;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'beerva-close-stale-sessions') then
    perform cron.unschedule('beerva-close-stale-sessions');
  end if;

  perform cron.schedule(
    'beerva-close-stale-sessions',
    '*/15 * * * *',
    'select public.invoke_stale_session_closer();'
  );
end;
$$;

revoke execute on function public.close_stale_active_sessions(integer) from public, anon, authenticated;
grant execute on function public.close_stale_active_sessions(integer) to service_role;
revoke execute on function public.invoke_stale_session_closer() from public, anon, authenticated;

comment on function public.close_stale_active_sessions(integer) is
  'Closes active sessions and pub crawls after 12 hours without drink activity; publishes records with drinks and cancels records with zero drinks.';
comment on function public.invoke_stale_session_closer() is
  'Cron target for closing stale active drinking sessions and pub crawls.';

notify pgrst, 'reload schema';
