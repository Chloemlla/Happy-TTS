import getApiBaseUrl from '../../api';


const API_BASE_URL = getApiBaseUrl();

export const API_URL = `${API_BASE_URL}/api/admin/envs`;
export const CONFIGURATION_NOTICE_API = `${API_BASE_URL}/api/health/configuration-notice`;
export const OUTEMAIL_API = `${API_BASE_URL}/api/admin/outemail/settings`;
export const EMAIL_SYSTEM_API = `${API_BASE_URL}/api/admin/email-system/setting`;
export const MODLIST_API = `${API_BASE_URL}/api/admin/modlist/setting`;
export const TTS_API = `${API_BASE_URL}/api/admin/tts/setting`;
export const TTS_PROVIDER_ADMIN_API = `${API_BASE_URL}/api/admin/tts/provider`;
export const LIBRECHAT_PROVIDERS_API = `${API_BASE_URL}/api/librechat/admin/providers`;
export const SHORTURL_AES_API = `${API_BASE_URL}/api/shorturl/admin/aes-key`;
export const WEBHOOK_SECRET_API = `${API_BASE_URL}/api/admin/webhook/secret`;
export const IPFS_CONFIG_API = `${API_BASE_URL}/api/ipfs/settings`;
export const TURNSTILE_CONFIG_API = `${API_BASE_URL}/api/turnstile/config`;
export const HCAPTCHA_CONFIG_API = `${API_BASE_URL}/api/turnstile/hcaptcha-config`;
export const CLARITY_CONFIG_API = `${API_BASE_URL}/api/tts/clarity/config`;
export const GITHUB_BILLING_CONFIG_API = `${API_BASE_URL}/api/github-billing/config`;
export const GITHUB_BILLING_MULTI_CONFIG_API = `${API_BASE_URL}/api/github-billing/multi-config`;
export const GOOGLE_AUTH_API = `${API_BASE_URL}/api/admin/google-auth/setting`;
export const NEXAI_SETTING_API = `${API_BASE_URL}/api/admin/nexai/setting`;
export const NEXAI_SIGNING_API = `${API_BASE_URL}/api/admin/nexai-signing/setting`;
export const CDICT_SIGNING_API = `${API_BASE_URL}/api/admin/cdict-signing/setting`;
export const SYNAPSE_ANDROID_API = `${API_BASE_URL}/api/admin/synapse-android/setting`;
export const CDICT_DONATION_API = `${API_BASE_URL}/api/admin/cdict-donation/setting`;
export const CDICT_DONATION_CLAIMS_API = `${API_BASE_URL}/api/admin/cdict-donation/claims`;
export const CDICT_DONATE_PUBLIC_API = `${API_BASE_URL}/api/cdict/donate`;
export const ECOENCHANTS_TOKEN_API = `${API_BASE_URL}/api/admin/envs`;
export const ECOENCHANTS_WEBHOOK_API = `${API_BASE_URL}/api/admin/envs`;
export const SECURITY_SECRET_API = `${API_BASE_URL}/api/admin/envs`;
export const LUMEN_CONFIG_API = `${API_BASE_URL}/api/admin/lumen-config`;
export const LUMEN_CONFIG_SYNC_API = `${API_BASE_URL}/api/admin/lumen-config/sync-github`;
export const LUMEN_SERVER_API = `${API_BASE_URL}/api/admin/lumen-server/setting`;
export const GOOGLE_WEB_CLIENT_ID_PATTERN = /^[\w-]+\.apps\.googleusercontent\.com$/i;

export function getAuthHeaders(): Record<string, string> {
  return {};
}

/**
 * 包装 fetch，自动携带 credentials: 'include' 以发送 cookie 认证。
 * env-manager 所有 API 调用都应使用此函数而非原始 fetch。
 */
export function authFetch(url: string, init?: RequestInit): Promise<Response> {
  return fetch(url, { ...init, credentials: 'include' });
}
