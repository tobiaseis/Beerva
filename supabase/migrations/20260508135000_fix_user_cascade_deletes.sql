-- Migration to fix foreign key constraints for profiles and sessions to enable ON DELETE CASCADE
-- This allows deleting users in the Supabase Dashboard without foreign key violation errors.

DO $$
DECLARE
  r record;
BEGIN
  -- 1. Fix public.profiles -> auth.users
  FOR r IN 
    SELECT tc.constraint_name 
    FROM information_schema.table_constraints tc 
    JOIN information_schema.key_column_usage kcu 
      ON tc.constraint_name = kcu.constraint_name 
      AND tc.table_schema = kcu.table_schema 
      AND tc.table_name = kcu.table_name
    WHERE tc.table_schema = 'public' 
      AND tc.table_name = 'profiles' 
      AND kcu.column_name = 'id' 
      AND tc.constraint_type = 'FOREIGN KEY'
  LOOP
    EXECUTE 'ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS ' || quote_ident(r.constraint_name);
  END LOOP;
  
  -- Drop the exact one we are about to add if it somehow got left behind
  ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_id_fkey;
  
  ALTER TABLE public.profiles
    ADD CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;

  -- 2. Fix public.sessions -> auth.users
  FOR r IN 
    SELECT tc.constraint_name 
    FROM information_schema.table_constraints tc 
    JOIN information_schema.key_column_usage kcu 
      ON tc.constraint_name = kcu.constraint_name 
      AND tc.table_schema = kcu.table_schema 
      AND tc.table_name = kcu.table_name
    WHERE tc.table_schema = 'public' 
      AND tc.table_name = 'sessions' 
      AND kcu.column_name = 'user_id' 
      AND tc.constraint_type = 'FOREIGN KEY'
  LOOP
    EXECUTE 'ALTER TABLE public.sessions DROP CONSTRAINT IF EXISTS ' || quote_ident(r.constraint_name);
  END LOOP;

  -- Drop the exact one we are about to add just in case
  ALTER TABLE public.sessions DROP CONSTRAINT IF EXISTS sessions_user_id_fkey;

  ALTER TABLE public.sessions
    ADD CONSTRAINT sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

END $$;
