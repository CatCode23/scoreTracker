/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
  readonly VITE_APP_NAME?: string;
  readonly VITE_GITHUB_PAGES_BASE?: string;
  readonly VITE_USERNAME_DOMAIN?: string;
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}
