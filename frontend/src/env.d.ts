/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL: string
  readonly VITE_WS_URL?: string
  readonly VITE_OUTEMAIL_ENABLED: 'true' | 'false'
  readonly VITE_TURNSTILE_DEBUG?: 'true' | 'false'
}

interface ImportMeta {
  readonly env: ImportMetaEnv
} 
