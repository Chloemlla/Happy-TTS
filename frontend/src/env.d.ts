/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL: string
  readonly VITE_WS_URL?: string
  readonly VITE_OUTEMAIL_ENABLED: 'true' | 'false'
  /** 强制开启/关闭 Vercel Web Analytics（见 components/VercelAnalytics.tsx） */
  readonly VITE_VERCEL_ANALYTICS?: 'true' | 'false'
}

interface ImportMeta {
  readonly env: ImportMetaEnv
} 
