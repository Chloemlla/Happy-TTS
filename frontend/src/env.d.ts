/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL: string
  readonly VITE_CLOUDFLARE_TURNSTILE_SITE_KEY: '0x4AAAAAABkocXH4KiqcoV1a'
  readonly VITE_ENABLE_TURNSTILE: string
  readonly VITE_OUTEMAIL_ENABLED: 'true'
}

interface ImportMeta {
  readonly env: ImportMetaEnv
} 