import { createClient } from '@supabase/supabase-js';

// Handle both VITE_ prefixed and non-prefixed environment variables
// Also handles the typo SUPABASE_ANON_KAY from Netlify
let supabaseUrl = (import.meta.env.VITE_SUPABASE_URL || (typeof process !== 'undefined' ? process.env.SUPABASE_URL : undefined))?.trim();
const supabaseAnonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY || (typeof process !== 'undefined' ? (process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KAY) : undefined))?.trim();

// Remove trailing slash if present
if (supabaseUrl && supabaseUrl.endsWith('/')) {
  supabaseUrl = supabaseUrl.slice(0, -1);
}

// Ensure URL has https:// prefix if it's just a domain
if (supabaseUrl && !supabaseUrl.startsWith('http')) {
  supabaseUrl = `https://${supabaseUrl}`;
}

// Auto-append .supabase.co if user only provided the project ID
if (supabaseUrl && !supabaseUrl.includes('.') && !supabaseUrl.includes('localhost')) {
  supabaseUrl = `${supabaseUrl}.supabase.co`;
}

export const isConfigured = Boolean(
  supabaseUrl && 
  supabaseAnonKey && 
  supabaseUrl !== 'https://placeholder.supabase.co' &&
  !supabaseUrl.includes('your-project.supabase.co') &&
  supabaseAnonKey !== 'your-anon-key'
);

if (!isConfigured) {
  console.warn('⚠️ Supabase credentials missing or invalid. Please check your environment variables (VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY). In AI Studio, configure these in the Secrets panel.');
}

export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder-key',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true
    },
    global: {
      headers: { 'x-application-name': 'consigna-beauty' }
    }
  }
);
