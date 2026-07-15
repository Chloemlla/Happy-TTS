import { getAuthToken, setAuthToken, clearAuthToken } from 'authSession';
/**
 * Frontend auth session helpers.
 *
 * Browser sessions are cookie-first (HttpOnly `synapse_token` set by the API).
 * Bearer tokens remain supported for API clients and multi-account switching.
 * When a bearer token is present we still attach Authorization; otherwise cookie
 * credentials alone authenticate same-site browser requests.
 */
const TOKEN_KEY = 'token';
const ACCOUNTS_KEY = 'synapse_saved_accounts';

export type StoredAccount = {
  user: {
    id: string;
    username?: string;
    email?: string;
    role?: string;
    [key: string]: unknown;
  };
  /** Optional bearer for multi-account switch / API clients. Prefer cookie for primary session. */
  token?: string;
  lastActive: number;
};

function canUseStorage(): boolean {
  return typeof window !== 'undefined' && typeof window.sessionStorage !== 'undefined';
}

export function getAuthToken(): string | null {
  if (!canUseStorage()) return null;
  return (
    window.sessionStorage.getItem(TOKEN_KEY) ||
    window.localStorage.getItem(TOKEN_KEY)
  );
}

/**
 * Persist bearer token only when explicitly needed (multi-account switch / non-cookie clients).
 * Primary browser login should rely on HttpOnly cookie and call clearAuthToken().
 */
export function setAuthToken(token: string): void {
  if (!canUseStorage()) return;
  window.sessionStorage.setItem(TOKEN_KEY, token);
  window.localStorage.removeItem(TOKEN_KEY);
}

export function clearAuthToken(): void {
  if (!canUseStorage()) return;
  window.sessionStorage.removeItem(TOKEN_KEY);
  window.localStorage.removeItem(TOKEN_KEY);
}

export function readSavedAccounts(): StoredAccount[] {
  if (!canUseStorage()) return [];
  const raw =
    window.sessionStorage.getItem(ACCOUNTS_KEY) ||
    window.localStorage.getItem(ACCOUNTS_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as StoredAccount[]) : [];
  } catch {
    return [];
  }
}

export function writeSavedAccounts(accounts: StoredAccount[]): void {
  if (!canUseStorage()) return;
  // Avoid persisting bearer tokens for accounts when not required.
  const sanitized = accounts.map((account) => ({
    user: account.user,
    token: account.token,
    lastActive: account.lastActive,
  }));
  const serialized = JSON.stringify(sanitized);
  window.sessionStorage.setItem(ACCOUNTS_KEY, serialized);
  window.localStorage.setItem(ACCOUNTS_KEY, serialized);
}

export function clearSavedAccounts(): void {
  if (!canUseStorage()) return;
  window.sessionStorage.removeItem(ACCOUNTS_KEY);
  window.localStorage.removeItem(ACCOUNTS_KEY);
}

export { TOKEN_KEY, ACCOUNTS_KEY };
