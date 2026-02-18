/**
 * Cloudflare Workers 环境绑定类型
 */
export interface Env {
  // KV Namespaces
  USERS_KV: KVNamespace;
  RATE_LIMIT_KV: KVNamespace;
  CACHE_KV: KVNamespace;
  SESSIONS_KV: KVNamespace;

  // R2 Buckets
  AUDIO_BUCKET: R2Bucket;
  DATA_BUCKET: R2Bucket;

  // 环境变量
  NODE_ENV: string;
  OPENAI_API_KEY: string;
  OPENAI_BASE_URL: string;
  OPENAI_MODEL: string;
  OPENAI_VOICE: string;
  OPENAI_RESPONSE_FORMAT: string;
  OPENAI_SPEED: string;
  JWT_SECRET: string;
  ADMIN_PASSWORD: string;
  SERVER_PASSWORD: string;
  GENERATION_CODE: string;
  BASE_URL: string;
  USER_STORAGE_MODE: string;

  // MongoDB Atlas Data API
  MONGO_DATA_API_KEY: string;
  MONGO_DATA_API_URL: string;

  // Turnstile
  TURNSTILE_SECRET_KEY: string;
  TURNSTILE_SITE_KEY: string;

  // Passkey
  RP_ID: string;
  RP_ORIGIN: string;
  RP_ORIGIN_MODE: string;
  ALLOWED_ORIGINS: string;

  // Email
  RESEND_API_KEY: string;
}

export interface User {
  id: string;
  username: string;
  email: string;
  password: string;
  role: 'user' | 'admin';
  dailyUsage: number;
  lastUsageDate: string;
  createdAt: string;
  token?: string;
  tokenExpiresAt?: number;
  totpSecret?: string;
  totpEnabled?: boolean;
  backupCodes?: string[];
  passkeyEnabled?: boolean;
  avatarUrl?: string;
}

export interface JWTPayload {
  userId: string;
  username: string;
  role: string;
  iat?: number;
  exp?: number;
}
