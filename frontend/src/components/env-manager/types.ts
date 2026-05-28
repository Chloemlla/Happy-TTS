export interface EnvItem {
  key: string;
  value: string;
  desc?: string;
  updatedAt?: string;
  source?: string;
}

export interface OutemailSettingItem {
  domain: string;
  code: string;
  updatedAt?: string;
}

export interface ModlistSettingItem {
  code: string;
  updatedAt?: string;
}

export interface TtsSettingItem {
  code: string;
  updatedAt?: string;
}

export interface ChatProviderItem {
  id: string;
  baseUrl: string;
  apiKey: string;
  model: string;
  group: string;
  enabled: boolean;
  weight: number;
  updatedAt?: string;
}

export interface ShortAesSetting {
  aesKey: string | null;
  updatedAt?: string;
}

export interface WebhookSecretSetting {
  key: string;
  secret: string | null;
  updatedAt?: string;
}

export interface IPFSConfigSetting {
  ipfsUploadUrl: string;
  ipfsUa?: string;
  imageBedApiUrl?: string;
  imageBedCdnDomain?: string | null;
  imageBedStorageDestination?: string | null;
  imageBedOutputFormat?: string | null;
  updatedAt?: string;
}

export interface TurnstileConfigSetting {
  enabled: boolean;
  siteKey: string | null;
  secretKey: string | null;
  updatedAt?: string;
}

export interface HCaptchaConfigSetting {
  enabled: boolean;
  siteKey: string | null;
  secretKey: string | null;
  updatedAt?: string;
}

export interface ClarityConfigSetting {
  enabled: boolean;
  projectId: string | null;
  updatedAt?: string;
}

export interface GitHubBillingConfigSetting {
  url?: string;
  method?: string;
  customerId?: string;
  headersCount?: number;
  hasCookies?: boolean;
  updatedAt?: string;
}

export interface MultiGitHubBillingConfig {
  config1?: GitHubBillingConfigSetting;
  config2?: GitHubBillingConfigSetting;
  config3?: GitHubBillingConfigSetting;
  lastUpdated?: string;
}

export interface DebugConsoleConfig {
  enabled: boolean;
  keySequence: string;
  verificationCode: string;
  maxAttempts: number;
  lockoutDuration: number;
  group: string;
  updatedAt?: string;
}

export interface DebugConsoleAccessLog {
  _id?: string;
  userId?: string;
  ip: string;
  userAgent: string;
  keySequence: string;
  verificationCode: string;
  success: boolean;
  attempts: number;
  timestamp: string;
  lockoutUntil?: string;
}
