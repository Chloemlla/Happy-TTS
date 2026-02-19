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
 * 所有 Passkey 操作都通过 api.951100.xyz 进行，
 * 这样所有创建的 Passkey 都有同一个 RP_ID = api.951100.xyz，
 * 因此在四个域名中完全通用。
 */

/**
 * 获取 Passkey API 基础 URL
 * 
 * 开发环境：使用本地后端地址（避免 CORS 问题）
 * 生产环境：使用统一的后端地址（确保 RP_ID 一致性）
 * 
 * @returns {string} Passkey API 服务器地址
 */
export const getPasskeyApiBase = (): string => {
  if (typeof window === 'undefined') {
    return 'https://api.951100.xyz';
  }

  if (import.meta.env.DEV) {
    // 开发环境：使用本地后端，避免 CORS 问题
    const currentHost = window.location.hostname;
    const currentPort = window.location.port;
    
    if (currentHost === '192.168.10.7' && currentPort === '3001') {
      return 'http://192.168.10.7:3000';
    }
    
    return 'http://localhost:3000';
  }
  
  // 生产环境：使用统一的后端
  return 'https://api.951100.xyz';
};

/**
 * Passkey API 基础 URL
 * 注意：这是在模块加载时调用的，如果需要运行时动态值，请使用 getPasskeyApiBase()
 */
export const PASSKEY_API_BASE = getPasskeyApiBase();

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
 * 获取 Passkey 操作使用的 Origin（clientOrigin）
 * 
 * 这是发送给后端的 origin 参数，用于 Passkey 验证
 * - 在所有环境中，都应该返回生产的 RP_ORIGIN（https://api.951100.xyz）
 * - 这确保了 Passkey 的一致性，不管从哪个环境访问
 * 
 * 区别：
 * - getPasskeyApiBase()：返回 API 请求的目标地址（开发环境用本地，生产环境用 https://api.951100.xyz）
 * - getPasskeyOrigin()：返回发送给后端的 clientOrigin（总是 https://api.951100.xyz）
 * 
 * @returns {string} 统一返回 https://api.951100.xyz
 */
export const getPasskeyOrigin = (): string => {
  // 无论在开发还是生产环境，clientOrigin 总是生产的 RP_ORIGIN
  return 'https://api.951100.xyz';
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

