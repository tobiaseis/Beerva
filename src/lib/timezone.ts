import { supabase } from './supabase';

export const DEFAULT_TIMEZONE = 'Europe/Copenhagen';

export const getCurrentTimezone = () => {
  try {
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return typeof timezone === 'string' && timezone.trim().length > 0
      ? timezone
      : DEFAULT_TIMEZONE;
  } catch {
    return DEFAULT_TIMEZONE;
  }
};

export const syncCurrentTimezone = async () => {
  const timezone = getCurrentTimezone();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  const { data, error } = await supabase
    .from('profiles')
    .select('timezone')
    .eq('id', user.id)
    .maybeSingle();

  if (error || data?.timezone === timezone) return;

  await supabase
    .from('profiles')
    .update({
      timezone,
      updated_at: new Date().toISOString(),
    })
    .eq('id', user.id);
};
