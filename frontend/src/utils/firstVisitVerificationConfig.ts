let enabled = true;

export function setFirstVisitVerificationEnabled(nextEnabled: boolean): void {
  enabled = nextEnabled;
}

export function isFirstVisitVerificationEnabled(): boolean {
  return enabled;
}
