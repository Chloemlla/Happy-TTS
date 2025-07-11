/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL: string
  readonly VITE_CLOUDFLARE_TURNSTILE_SITE_KEY: '0x4AAAAAABkocXH4KiqcoV1a'
}

interface ImportMeta {
  readonly env: ImportMetaEnv
} 