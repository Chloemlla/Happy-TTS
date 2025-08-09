/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL: string
  readonly VITE_CLOUDFLARE_TURNSTILE_SITE_KEY: 'string'
  readonly VITE_ENABLE_TURNSTILE: string
  readonly VITE_OUTEMAIL_ENABLED: 'true' | 'false'
}

interface ImportMeta {
  readonly env: ImportMetaEnv
} 