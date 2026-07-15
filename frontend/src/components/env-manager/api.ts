import getApiBaseUrl from '../../api';
import { getAuthToken } from '../../utils/authSession';


const API_BASE_URL = getApiBaseUrl();

export const API_URL = `${API_BASE_URL}/api/admin/envs`;
export const OUTEMAIL_API = `${API_BASE_URL}/api/admin/outemail/settings`;
export const MODLIST_API = `${API_BASE_URL}/api/admin/modlist/setting`;
export const TTS_API = `${API_BASE_URL}/api/admin/tts/setting`;
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
export const SYNAPSE_ANDROID_API = `${API_BASE_URL}/api/admin/synapse-android/setting`;
export const GOOGLE_WEB_CLIENT_ID_PATTERN = /^[\w-]+\.apps\.googleusercontent\.com$/i;

export function getAuthHeaders(): Record<string, string> {
  const token = getAuthToken();
  if (token) return { Authorization: `Bearer ${token}` };
  return {};
}
