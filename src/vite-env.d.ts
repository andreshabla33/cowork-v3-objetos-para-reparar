/// <reference types="vite/client" />

declare module '*?raw' {
  const content: string
  export default content
}

interface ImportMetaEnv {
  readonly VITE_APP_URL: string;
  readonly VITE_GOOGLE_CLIENT_ID: string;
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_ANON_KEY: string;
  readonly VITE_TURN_URL: string;
  readonly VITE_TURN_URL_TCP: string;
  readonly VITE_TURN_URL_TLS: string;
  readonly VITE_TURN_URL_TLS_TCP: string;
  readonly VITE_TURN_USERNAME: string;
  readonly VITE_TURN_CREDENTIAL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
