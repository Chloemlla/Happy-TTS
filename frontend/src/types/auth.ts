export interface User {
  id: string;
  username: string;
  email: string;
  role: string;
  /** 由管理员接口返回，普通登录 payload 不含（契约对齐：标为可选） */
  dailyUsage?: number;
  /** 由管理员接口返回，普通登录 payload 不含（契约对齐：标为可选） */
  lastUsageDate?: string;
  /** 由管理员接口返回，普通登录 payload 不含（契约对齐：标为可选） */
  createdAt?: string;
  remainingUsage?: number;
  totpEnabled?: boolean;
  /**
   * 已废弃：后端 authController 显式剥除以下敏感字段，登录/me 接口永不会返回，
   * 仅作类型占位，勿当作真实可用字段读取。
   */
  totpSecret?: string;
  backupCodes?: string[];
  token?: string;
  tokenExpiresAt?: number;
  avatarUrl?: string; // 新增头像URL字段
  isTranslationEnabled?: boolean;
  translationAccessUntil?: string;
  accountStatus?: 'active' | 'suspended';
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
