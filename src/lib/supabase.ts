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

/**
 * Checks if an error is related to an expired or missing refresh token.
 */
export function isRefreshTokenError(err: any): boolean {
  if (!err) return false;
  const msg = typeof err === 'string'
    ? err
    : (err.message || err.error_description || (err.reason && (err.reason.message || String(err.reason))) || String(err));
  return (
    msg.includes('Refresh Token Not Found') ||
    msg.includes('Invalid Refresh Token') ||
    msg.includes('refresh_token_not_found') ||
    msg.includes('invalid_grant')
  );
}

/**
 * Completely purges all stored Supabase authentication keys from localStorage.
 */
export function clearSupabaseAuth() {
  if (typeof window === 'undefined') return;
  try {
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && (key.startsWith('sb-') || key.includes('supabase.auth') || key.includes('-auth-token'))) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach(k => {
      try {
        localStorage.removeItem(k);
      } catch {}
    });
  } catch {}
}

// Pre-sanitize localStorage on startup: remove empty or corrupt tokens before client initialization
if (typeof window !== 'undefined') {
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i);
      if (key && (key.startsWith('sb-') || key.includes('supabase.auth') || key.includes('-auth-token'))) {
        const raw = localStorage.getItem(key);
        if (!raw) {
          localStorage.removeItem(key);
          continue;
        }
        try {
          const parsed = JSON.parse(raw);
          if (!parsed || typeof parsed !== 'object' || (!parsed.access_token && !parsed.refresh_token)) {
            localStorage.removeItem(key);
          }
        } catch {
          localStorage.removeItem(key);
        }
      }
    }
  } catch {}

  // Intercept unhandled promise rejections originating from auth refresh
  window.addEventListener('unhandledrejection', (event) => {
    if (isRefreshTokenError(event.reason)) {
      event.preventDefault();
      event.stopPropagation();
      clearSupabaseAuth();
      try {
        supabase.auth.signOut({ scope: 'local' }).catch(() => {});
      } catch {}
    }
  });

  // Intercept window error events
  window.addEventListener('error', (event) => {
    if (isRefreshTokenError(event.error) || isRefreshTokenError(event.message)) {
      event.preventDefault();
      event.stopPropagation();
      clearSupabaseAuth();
    }
  });
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

// Wrap getSession to gracefully catch and clear invalid refresh tokens without throwing errors
const originalGetSession = supabase.auth.getSession.bind(supabase.auth);
supabase.auth.getSession = async () => {
  try {
    const res = await originalGetSession();
    if (res.error && isRefreshTokenError(res.error)) {
      clearSupabaseAuth();
      try {
        await supabase.auth.signOut({ scope: 'local' });
      } catch {}
      return { data: { session: null }, error: null };
    }
    return res;
  } catch (err: any) {
    if (isRefreshTokenError(err)) {
      clearSupabaseAuth();
      try {
        await supabase.auth.signOut({ scope: 'local' });
      } catch {}
      return { data: { session: null }, error: null };
    }
    throw err;
  }
};

// Wrap getUser to also handle invalid refresh token gracefully
const originalGetUser = supabase.auth.getUser.bind(supabase.auth);
supabase.auth.getUser = async (jwt?: string) => {
  try {
    const res = await originalGetUser(jwt);
    if (res.error && isRefreshTokenError(res.error)) {
      clearSupabaseAuth();
      try {
        await supabase.auth.signOut({ scope: 'local' });
      } catch {}
      return { data: { user: null }, error: null };
    }
    return res;
  } catch (err: any) {
    if (isRefreshTokenError(err)) {
      clearSupabaseAuth();
      try {
        await supabase.auth.signOut({ scope: 'local' });
      } catch {}
      return { data: { user: null }, error: null };
    }
    throw err;
  }
};

// Ensure signOut always clears local storage tokens completely
const originalSignOut = supabase.auth.signOut.bind(supabase.auth);
supabase.auth.signOut = async (options?: any) => {
  clearSupabaseAuth();
  return originalSignOut(options);
};
