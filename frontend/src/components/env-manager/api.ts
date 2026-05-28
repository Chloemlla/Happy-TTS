import getApiBaseUrl from '../../api';

const API_BASE_URL = getApiBaseUrl();

export const API_URL = `${API_BASE_URL}/api/admin/envs`;
export const OUTEMAIL_API = `${API_BASE_URL}/api/admin/outemail/settings`;
export const MODLIST_API = `${API_BASE_URL}/api/admin/modlist/setting`;
export const TTS_API = `${API_BASE_URL}/api/admin/tts/setting`;
export const LIBRECHAT_PROVIDERS_API = `${API_BASE_URL}/api/librechat/admin/providers`;
export const SHORTURL_AES_API = `${API_BASE_URL}/api/shorturl/admin/aes-key`;
export const WEBHOOK_SECRET_API = `${API_BASE_URL}/api/admin/webhook/secret`;
export const DEBUG_CONSOLE_API = `${API_BASE_URL}/api/debug-console`;
export const IPFS_CONFIG_API = `${API_BASE_URL}/api/ipfs/settings`;
export const TURNSTILE_CONFIG_API = `${API_BASE_URL}/api/turnstile/config`;
export const HCAPTCHA_CONFIG_API = `${API_BASE_URL}/api/turnstile/hcaptcha-config`;
export const CLARITY_CONFIG_API = `${API_BASE_URL}/api/tts/clarity/config`;
export const GITHUB_BILLING_CONFIG_API = `${API_BASE_URL}/api/github-billing/config`;
export const GITHUB_BILLING_MULTI_CONFIG_API = `${API_BASE_URL}/api/github-billing/multi-config`;

export function getAuthHeaders(): Record<string, string> {
  const token = localStorage.getItem('token');
  if (token) return { Authorization: `Bearer ${token}` };
  return {};
}
