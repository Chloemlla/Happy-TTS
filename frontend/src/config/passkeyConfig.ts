/**
 * Passkey 统一配置
 * 确保所有前端都使用同一个 RP_ORIGIN 进行 Passkey 操作
 * 
 * 场景：四个独立前端，一个共享后端
 * - tts.hapx.one
 * - tts.hapxs.com
 * - 951100.xyz
 * - tts.951100.xyz
 * 
 * 所有 Passkey 操作都通过 api.hapxs.com 进行，
 * 这样所有创建的 Passkey 都有同一个 RP_ID = api.hapxs.com，
 * 因此在四个域名中完全通用。
 */

/**
 * 统一的 Passkey API 服务器
 * 所有 Passkey 相关的请求都必须发送到这个地址
 * 这确保了 RP_ID 的统一性
 */
export const PASSKEY_API_BASE = 'https://api.hapxs.com';

/**
 * 所有允许的前端域名
 * 这些域名上的用户创建的 Passkey 都会使用同一个 RP_ID
 */
export const ALLOWED_FRONTEND_DOMAINS = [
  'tts.hapx.one',
  'tts.hapxs.com',
  '951100.xyz',
  'tts.951100.xyz'
];

/**
 * 获取 Passkey 操作使用的 Origin
 * 
 * 重要区别：
 * - 普通 API 请求：向当前页面所在服务器发送（可以在各个前端服务器处理）
 * - Passkey 请求：必须向统一的 API 服务器发送（确保 RP_ID 一致）
 * 
 * @returns {string} 统一返回 https://api.hapxs.com
 */
export const getPasskeyOrigin = (): string => {
  return PASSKEY_API_BASE;
};

/**
 * 验证当前前端是否在允许的域名列表中
 * @returns {boolean} 当前域名是否被允许
 */
export const isAllowedFrontendDomain = (): boolean => {
  if (typeof window === 'undefined') {
    return false;
  }
  
  return ALLOWED_FRONTEND_DOMAINS.some(domain => 
    window.location.hostname === domain
  );
};

/**
 * 获取当前前端的完整 URL
 * @returns {string} 当前前端的协议 + 域名
 */
export const getCurrentFrontendOrigin = (): string => {
  if (typeof window === 'undefined') {
    return '';
  }
  
  return `${window.location.protocol}//${window.location.host}`;
};

/**
 * 调试日志：记录 Passkey 配置信息
 */
export const logPasskeyConfig = (): void => {
  if (typeof window === 'undefined') {
    return;
  }
  
  console.group('[Passkey Config]');
  console.log('Current Frontend Origin:', getCurrentFrontendOrigin());
  console.log('Passkey API Base:', PASSKEY_API_BASE);
  console.log('Is Allowed Domain:', isAllowedFrontendDomain());
  console.log('Allowed Domains:', ALLOWED_FRONTEND_DOMAINS);
  console.groupEnd();
};

/**
 * 配置验证
 * 在应用启动时调用，确保配置正确
 */
export const validatePasskeyConfig = (): boolean => {
  if (typeof window === 'undefined') {
    return true;
  }
  
  const isAllowed = isAllowedFrontendDomain();
  
  if (!isAllowed) {
    console.warn(
      `[Passkey Config] Warning: Current domain "${window.location.hostname}" is not in the allowed list.`,
      'Allowed domains:', ALLOWED_FRONTEND_DOMAINS
    );
    return false;
  }
  
  return true;
};

export default {
  PASSKEY_API_BASE,
  ALLOWED_FRONTEND_DOMAINS,
  getPasskeyOrigin,
  isAllowedFrontendDomain,
  getCurrentFrontendOrigin,
  logPasskeyConfig,
  validatePasskeyConfig
};

