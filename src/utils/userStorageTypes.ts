export interface ValidationError {
  field: string;
  message: string;
}

export interface User {
  id: string;
  username: string;
  email: string;
  password?: string;
  passwordHash?: string;
  passwordCiphertext?: string;
  passwordIv?: string;
  passwordTag?: string;
  passwordKeyVersion?: string;
  passwordWrappedDek?: string;
  passwordDekId?: string;
  role: "user" | "admin" | "trusted";
  dailyUsage: number;
  lastUsageDate: string;
  createdAt: string;
  token?: string;
  tokenExpiresAt?: number;
  totpSecret?: string;
  totpEnabled?: boolean;
  backupCodes?: string[];
  passkeyEnabled?: boolean;
  passkeyCredentials?: {
    id: string;
    name: string;
    credentialID: string;
    credentialPublicKey: string;
    counter: number;
    createdAt: string;
  }[];
  pendingChallenge?: string;
  currentChallenge?: string;
  passkeyVerified?: boolean;
  avatarUrl?: string;
  authProvider?: "local" | "linuxdo" | "google";
  linuxdoId?: string;
  linuxdoUsername?: string;
  linuxdoAvatarUrl?: string;
  requireFingerprint?: boolean;
  requireFingerprintAt?: number;
  fingerprints?: {
    id: string;
    ts: number;
    ua?: string;
    ip?: string;
  }[];
  fingerprintCount?: number;
  latestFingerprint?: {
    id: string;
    ts: number;
    ua?: string;
    ip?: string;
  } | null;
  lastLoginIp?: string;
  lastLoginAt?: string;
  ticketViolationCount?: number;
  ticketBannedUntil?: string;
  isTranslationEnabled?: boolean;
  translationAccessUntil?: string;
  accountStatus?: "active" | "suspended";
}
