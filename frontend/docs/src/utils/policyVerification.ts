interface PolicyConsent {
  timestamp: number;
  version: string;
  fingerprint: string;
  checksum: string;
}

class PolicyVerificationSystem {
  private readonly STORAGE_KEY = 'hapxtts_policy_consent';
  private readonly MODAL_STORAGE_KEY = 'hapxtts_support_modal_shown';
  private readonly POLICY_VERSION = '2.0';

  private modalCallbacks: Array<(show: boolean) => void> = [];

  private isBrowser(): boolean {
    return typeof window !== 'undefined' && typeof localStorage !== 'undefined';
  }

  private async sha256Hash(input: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(input);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((value) => value.toString(16).padStart(2, '0')).join('').substring(0, 8);
  }

  private async generateFingerprint(): Promise<string> {
    if (!this.isBrowser() || typeof document === 'undefined') {
      return 'server';
    }

    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');

    if (context) {
      context.textBaseline = 'top';
      context.font = '14px Arial';
      context.fillText('Policy verification fingerprint', 2, 2);
    }

    const source = [
      navigator.userAgent,
      navigator.language,
      `${screen.width}x${screen.height}`,
      new Date().getTimezoneOffset(),
      canvas.toDataURL(),
      navigator.hardwareConcurrency || 0,
      navigator.maxTouchPoints || 0,
    ].join('|');

    return this.sha256Hash(source);
  }

  private async generateChecksum(consent: Omit<PolicyConsent, 'checksum'>): Promise<string> {
    const data = `${consent.timestamp}|${consent.version}|${consent.fingerprint}`;
    return this.sha256Hash(`${data}|hapxtts_local_policy`);
  }

  private async verifyChecksum(consent: PolicyConsent): Promise<boolean> {
    const checksum = await this.generateChecksum({
      timestamp: consent.timestamp,
      version: consent.version,
      fingerprint: consent.fingerprint,
    });

    return checksum === consent.checksum;
  }

  private readStoredConsent(): PolicyConsent | null {
    if (!this.isBrowser()) {
      return null;
    }

    try {
      const raw = localStorage.getItem(this.STORAGE_KEY);
      if (!raw) {
        return null;
      }

      return JSON.parse(raw) as PolicyConsent;
    } catch (error) {
      console.error('Failed to parse local policy consent:', error);
      this.clearConsent();
      return null;
    }
  }

  public async hasValidConsent(): Promise<boolean> {
    if (!this.isBrowser()) {
      return false;
    }

    const consent = this.readStoredConsent();
    if (!consent) {
      return false;
    }

    if (consent.version !== this.POLICY_VERSION) {
      this.clearConsent();
      return false;
    }

    const isChecksumValid = await this.verifyChecksum(consent);
    if (!isChecksumValid) {
      this.clearConsent();
      return false;
    }

    const currentFingerprint = await this.generateFingerprint();
    if (consent.fingerprint !== currentFingerprint) {
      this.clearConsent();
      return false;
    }

    return true;
  }

  public async recordConsent(): Promise<void> {
    if (!this.isBrowser()) {
      return;
    }

    const consentWithoutChecksum = {
      timestamp: Date.now(),
      version: this.POLICY_VERSION,
      fingerprint: await this.generateFingerprint(),
    };

    const checksum = await this.generateChecksum(consentWithoutChecksum);
    const consent: PolicyConsent = { ...consentWithoutChecksum, checksum };
    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(consent));
  }

  public clearConsent(): void {
    if (!this.isBrowser()) {
      return;
    }

    localStorage.removeItem(this.STORAGE_KEY);
  }

  public async verifyConsentWithServer(): Promise<boolean> {
    return this.hasValidConsent();
  }

  public async hasValidConsentWithFallback(): Promise<boolean> {
    return this.hasValidConsent();
  }

  public getPolicyVersion(): string {
    return this.POLICY_VERSION;
  }

  public isDevelopment(): boolean {
    if (typeof window === 'undefined') {
      return process.env.NODE_ENV === 'development';
    }

    return (
      process.env.NODE_ENV === 'development' ||
      window.location.hostname === 'localhost' ||
      window.location.hostname === '127.0.0.1'
    );
  }

  public performIntegrityCheck(): boolean {
    return true;
  }

  public registerModalCallback(callback: (show: boolean) => void): void {
    this.modalCallbacks.push(callback);
  }

  public unregisterModalCallback(callback: (show: boolean) => void): void {
    this.modalCallbacks = this.modalCallbacks.filter((item) => item !== callback);
  }

  public showModal(): void {
    this.modalCallbacks.forEach((callback) => callback(true));
  }

  public hideModal(): void {
    this.modalCallbacks.forEach((callback) => callback(false));
  }

  public shouldShowModal(): boolean {
    if (!this.isBrowser()) {
      return false;
    }

    return !localStorage.getItem(this.MODAL_STORAGE_KEY);
  }

  public markModalAsShown(): void {
    if (!this.isBrowser()) {
      return;
    }

    localStorage.setItem(this.MODAL_STORAGE_KEY, '1');
  }

  public clearModalStatus(): void {
    if (!this.isBrowser()) {
      return;
    }

    localStorage.removeItem(this.MODAL_STORAGE_KEY);
  }

  public getModalStatus(): string | null {
    if (!this.isBrowser()) {
      return null;
    }

    return localStorage.getItem(this.MODAL_STORAGE_KEY);
  }

  public async initializePolicyCheck(): Promise<boolean> {
    return this.hasValidConsent();
  }

  public async handleUserConsent(): Promise<void> {
    await this.recordConsent();
    this.markModalAsShown();
    this.hideModal();
  }
}

export const policyVerification = new PolicyVerificationSystem();

export type { PolicyConsent };
