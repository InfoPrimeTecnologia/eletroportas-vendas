import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://pdwghmxolqiuyxunglon.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBkd2dobXhvbHFpdXl4dW5nbG9uIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjkyNjM1NTMsImV4cCI6MjA4NDgzOTU1M30.FmYvMO9HLz-AUUH29TwBbRYA2KMPdyczSjorq3vVDcM';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: localStorage,
    persistSession: true,
    autoRefreshToken: true,
  },
});
