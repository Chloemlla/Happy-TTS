/**
 * Frontend auth session helpers.
 *
 * Browser sessions are cookie-only: the API sets HttpOnly `synapse_token`.
 * JS storage must not keep access tokens for ordinary browser login flows.
 * `setAuthToken` remains for explicit non-browser / injected-token paths only.
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
  /** Only for explicit multi-account bearer injection; browser login leaves this empty. */
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

/** Explicit bearer injection only. Browser cookie login must call clearAuthToken(). */
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
  // Browser account switcher stores identity metadata only.
  const sanitized = accounts.map((account) => ({
    user: account.user,
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
