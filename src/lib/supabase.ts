import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import 'react-native-url-polyfill/auto';

const supabaseUrl = 'https://yzrfihijpusvjypypnip.supabase.co';
const supabaseAnonKey = 'sb_publishable_s-eJ6PwDoAIjnVlAH_ul1w_E3sgmM9v';

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
