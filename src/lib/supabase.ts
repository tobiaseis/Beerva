import { createClient } from '@supabase/supabase-js';

// These are placeholder values. In a real app, these would come from .env
const supabaseUrl = 'https://placeholder-project.supabase.co';
const supabaseAnonKey = 'placeholder-anon-key';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
