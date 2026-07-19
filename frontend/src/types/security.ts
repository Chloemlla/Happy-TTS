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

// 安全配置（实际 CSP 由后端 helmet + contentSecurityPolicy 下发；此处仅作前端参考）
export const SECURITY_CONFIG = {
  MAX_CONTENT_LENGTH: 10000, // 10KB
  MAX_LOCALSTORAGE_SIZE: 1024 * 1024, // 1MB
  ALLOWED_ORIGINS: ['same-origin'],
  CSRF_TOKEN_HEADER: 'X-CSRF-Token',
  // Mirrors backend intent: no unsafe-eval; scripts use nonces; style attrs may be unsafe-inline.
  CONTENT_SECURITY_POLICY: {
    'default-src': ["'self'"],
    'script-src': ["'self'", "'nonce-backend'"],
    'script-src-attr': ["'none'"],
    'style-src': ["'self'", "'nonce-backend'"],
    'style-src-attr': ["'unsafe-inline'"],
    'img-src': ["'self'", 'data:', 'https:'],
    'connect-src': ["'self'"],
    'font-src': ["'self'", 'data:'],
    'object-src': ["'none'"],
    'media-src': ["'self'", 'blob:', 'data:'],
    'frame-src': ["'self'"],
    'frame-ancestors': ["'none'"],
  }
} as const; 