import { createClient } from '@supabase/supabase-js';
import { CONFIG_PUBLICA_APP } from './env';

export const APP_URL = CONFIG_PUBLICA_APP.urlApp;
export const SUPABASE_URL = CONFIG_PUBLICA_APP.urlSupabase;
export const SUPABASE_ANON_KEY = CONFIG_PUBLICA_APP.claveAnonSupabase;

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
