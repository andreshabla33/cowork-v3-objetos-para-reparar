import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !ANON_KEY) {
  console.error('Missing env vars');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, ANON_KEY);

async function testLogin() {
  console.log('Testing login...');
  const { data, error } = await supabase.auth.signInWithPassword({
    email: 'qa-test@cowork.app',
    password: 'TestQA2026!'
  });

  if (error) {
    console.error('Login Failed:', error.message, error.status, error.name);
  } else {
    console.log('Login Success!', data.user.id);
  }
}

testLogin();
