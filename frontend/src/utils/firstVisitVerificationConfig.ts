let enabled = true;

export function setFirstVisitVerificationEnabled(nextEnabled: boolean): void {
  enabled = nextEnabled;

  if (!nextEnabled && typeof window !== 'undefined') {
    try {
      localStorage.removeItem('accessTokens');
      localStorage.removeItem('hapx_ip_verification_token_v1');
    } catch {
      // ignore storage failures
    }
  }
}

export function isFirstVisitVerificationEnabled(): boolean {
  return enabled;
}
