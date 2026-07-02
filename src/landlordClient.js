import { createClient } from "@supabase/supabase-js";

// Configure these in Vercel → Project → Settings → Environment Variables.
const url = import.meta.env.VITE_SUPABASE_URL;
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anon) {
  // Surfaced in the console during setup; the login screen also shows a hint.
  console.error("Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY.");
}

export const landlordClient = createClient(url, anon, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});
