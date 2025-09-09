import { api } from './api';

// hCaptcha 配置接口
export interface HCaptchaConfig {
  siteKey: string;
  enabled: boolean;
  theme?: 'light' | 'dark';
  size?: 'normal' | 'compact' | 'invisible';
}

// hCaptcha 验证请求接口
export interface HCaptchaVerifyRequest {
  token: string;
  timestamp?: string;
  remoteip?: string;
}

// hCaptcha 验证响应接口
export interface HCaptchaVerifyResponse {
  success: boolean;
  message: string;
  score?: number;
  timestamp: string;
  details?: {
    hostname?: string;
    challenge_ts?: string;
    error_codes?: string[];
    credit?: boolean;
  };
}

// hCaptcha 错误代码映射
export const HCAPTCHA_ERROR_CODES: Record<string, string> = {
  'missing-input-secret': '缺少密钥参数',
  'invalid-input-secret': '密钥参数无效',
  'missing-input-response': '缺少验证响应参数',
  'invalid-input-response': '验证响应参数无效',
  'bad-request': '请求格式错误',
  'invalid-or-already-seen-response': '验证响应无效或已被使用',
  'not-using-dummy-passcode': '未使用测试通行码',
  'sitekey-secret-mismatch': '站点密钥与密钥不匹配'
};

// API 方法
export const hcaptchaApi = {
  // 获取 hCaptcha 配置
  getConfig: async (): Promise<HCaptchaConfig> => {
    const response = await api.get<HCaptchaConfig>('/api/hcaptcha/config');
    return response.data;
  },

  // 验证 hCaptcha token
  verify: async (request: HCaptchaVerifyRequest): Promise<HCaptchaVerifyResponse> => {
    const response = await api.post<HCaptchaVerifyResponse>('/api/hcaptcha/verify', request);
    return response.data;
  },

  // 获取验证历史记录（管理员功能）
  getVerificationHistory: async (limit?: number, offset?: number) => {
    const params = new URLSearchParams();
    if (limit) params.append('limit', limit.toString());
    if (offset) params.append('offset', offset.toString());
    
    const response = await api.get(`/api/hcaptcha/history?${params.toString()}`);
    return response.data;
  },

  // 获取验证统计信息（管理员功能）
  getVerificationStats: async (startDate?: string, endDate?: string) => {
    const params = new URLSearchParams();
    if (startDate) params.append('startDate', startDate);
    if (endDate) params.append('endDate', endDate);
    
    const response = await api.get(`/api/hcaptcha/stats?${params.toString()}`);
    return response.data;
  }
};

export default hcaptchaApi;
