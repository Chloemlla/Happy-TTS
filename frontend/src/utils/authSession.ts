/**
 * Frontend auth session helpers.
 * Prefer sessionStorage over localStorage to shrink XSS/shared-device blast radius.
 * Multi-account list remains device-local but still avoids long-lived full-tab persistence where possible.
 */
const TOKEN_KEY = 'token';
const ACCOUNTS_KEY = 'synapse_saved_accounts';

export type StoredAccount = {
  user: unknown;
  token: string;
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

export function setAuthToken(token: string): void {
  if (!canUseStorage()) return;
  window.sessionStorage.setItem(TOKEN_KEY, token);
  // Remove legacy long-lived copy so XSS on later visits cannot reuse old localStorage tokens.
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
  const serialized = JSON.stringify(accounts);
  window.sessionStorage.setItem(ACCOUNTS_KEY, serialized);
  // Keep a localStorage mirror for multi-tab convenience, but primary runtime reads session first.
  window.localStorage.setItem(ACCOUNTS_KEY, serialized);
}

export function clearSavedAccounts(): void {
  if (!canUseStorage()) return;
  window.sessionStorage.removeItem(ACCOUNTS_KEY);
  window.localStorage.removeItem(ACCOUNTS_KEY);
}

export { TOKEN_KEY, ACCOUNTS_KEY };
