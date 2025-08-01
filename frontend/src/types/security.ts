// 安全相关的类型定义

export interface SecureFetchOptions extends RequestInit {
  credentials?: RequestCredentials;
  headers?: Record<string, string>;
}

export interface SanitizedContent {
  content: string;
  format: 'markdown' | 'html';
  sanitized: boolean;
}

export interface LocalStorageData {
  type: 'date' | 'permanent';
  date?: string;
  timestamp: number;
}

export interface ErrorBoundaryState {
  hasError: boolean;
  error?: Error;
  errorInfo?: React.ErrorInfo;
}

// 安全配置
export const SECURITY_CONFIG = {
  MAX_CONTENT_LENGTH: 10000, // 10KB
  MAX_LOCALSTORAGE_SIZE: 1024 * 1024, // 1MB
  ALLOWED_ORIGINS: ['same-origin'],
  CSRF_TOKEN_HEADER: 'X-CSRF-Token',
  CONTENT_SECURITY_POLICY: {
    'default-src': ["'self'"],
    'script-src': ["'self'", "'unsafe-inline'"],
    'style-src': ["'self'", "'unsafe-inline'"],
    'img-src': ["'self'", 'data:', 'https:'],
    'connect-src': ["'self'"],
    'font-src': ["'self'"],
    'object-src': ["'none'"],
    'media-src': ["'self'"],
    'frame-src': ["'none'"]
  }
} as const; 