export const env = {
  supabaseUrl: import.meta.env.VITE_SUPABASE_URL ?? '',
  supabaseAnonKey: import.meta.env.VITE_SUPABASE_ANON_KEY ?? '',
  appName: import.meta.env.VITE_APP_NAME || 'WOTB Tournament Tracker',
};

export const isConfigured = Boolean(env.supabaseUrl && env.supabaseAnonKey);

/** Absolute URL of the app root (works on localhost and GitHub Pages). */
export function appRootUrl(): string {
  return `${window.location.origin}${import.meta.env.BASE_URL}`;
}
