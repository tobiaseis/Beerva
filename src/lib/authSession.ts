import type { User } from '@supabase/supabase-js';

import { supabase } from './supabase';

/**
 * Reads the signed-in user from the locally cached session (no network round-trip).
 * Prefer this over `supabase.auth.getUser()` whenever you only need the user id —
 * `getUser()` revalidates the JWT against the auth server on every call.
 */
export const getCurrentUser = async (): Promise<User | null> => {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.user ?? null;
};

export const getCurrentUserId = async (): Promise<string | null> => {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.user?.id ?? null;
};
