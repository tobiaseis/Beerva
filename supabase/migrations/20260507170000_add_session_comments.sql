alter table public.sessions
  add column if not exists "comment" text;

comment on column public.sessions."comment" is 'Optional user-written note attached to a beer session.';
