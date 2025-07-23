export interface User {
  id: string;
  username: string;
  email: string;
  role: string;
  dailyUsage: number;
  lastUsageDate: string;
  createdAt: string;
  remainingUsage?: number;
  totpEnabled?: boolean;
  totpSecret?: string;
  backupCodes?: string[];
  token?: string;
  tokenExpiresAt?: number;
  avatarUrl?: string; // 新增头像URL字段
}

export interface TOTPStatus {
  enabled: boolean;
  hasBackupCodes: boolean;
  type?: string[];
}

export interface TOTPSetupData {
  secret: string;
  otpauthUrl: string;
  qrCodeDataUrl: string;
  backupCodes: string[];
  message: string;
}

export interface TOTPErrorResponse {
  error: string;
  remainingAttempts?: number;
  lockedUntil?: number;
  debug?: {
    expectedToken: string;
    prevToken: string;
    nextToken: string;
    message: string;
  };
}

export interface TOTPVerificationResponse {
  message: string;
  verified: boolean;
}

export interface TOTPEnableResponse {
  message: string;
  enabled: boolean;
}

export interface TOTPDisableResponse {
  message: string;
  enabled: boolean;
}

export interface BackupCodesResponse {
  backupCodes: string[];
  remainingCount: number;
  message: string;
} 