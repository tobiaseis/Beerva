create index if not exists sessions_user_id_created_at_idx
  on public.sessions(user_id, created_at desc);
