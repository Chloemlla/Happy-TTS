import CryptoJS from 'crypto-js';

// CAPTCHA 验证方式枚举
export enum CaptchaType {
  TURNSTILE = 'turnstile',
  HCAPTCHA = 'hcaptcha'
}

// 加密选择结果的接口
export interface EncryptedCaptchaSelection {
  encryptedData: string;
  timestamp: number;
  hash: string;
}

// 解密后的选择结果接口
export interface CaptchaSelection {
  type: CaptchaType;
  timestamp: number;
  fingerprint: string;
  random: number;
}

/**
 * 生成安全的随机CAPTCHA选择
 * @param fingerprint 浏览器指纹
 * @param availableTypes 可用的验证方式
 * @returns 加密的选择结果
 */
export function generateSecureCaptchaSelection(
  fingerprint: string,
  availableTypes: CaptchaType[] = [CaptchaType.TURNSTILE, CaptchaType.HCAPTCHA]
): EncryptedCaptchaSelection {
  // 生成时间戳（毫秒）
  const timestamp = Date.now();
  
  // 生成安全随机数
  const randomArray = new Uint32Array(1);
  crypto.getRandomValues(randomArray);
  const random = randomArray[0];
  
  // 基于随机数选择验证方式
  const selectedIndex = random % availableTypes.length;
  const selectedType = availableTypes[selectedIndex];
  
  // 创建选择对象
  const selection: CaptchaSelection = {
    type: selectedType,
    timestamp,
    fingerprint,
    random
  };
  
  // 生成密钥（基于时间戳和指纹）
  const keyMaterial = `${fingerprint}_${Math.floor(timestamp / 60000)}`; // 每分钟更换密钥
  const encryptionKey = CryptoJS.SHA256(keyMaterial).toString();
  
  // 加密选择数据
  const dataToEncrypt = JSON.stringify(selection);
  const encrypted = CryptoJS.AES.encrypt(dataToEncrypt, encryptionKey).toString();
  
  // 生成完整性哈希
  const hashData = `${encrypted}_${timestamp}_${fingerprint}`;
  const hash = CryptoJS.SHA256(hashData).toString();
  
  return {
    encryptedData: encrypted,
    timestamp,
    hash
  };
}

/**
 * 验证加密选择的完整性
 * @param encryptedSelection 加密的选择结果
 * @param fingerprint 浏览器指纹
 * @returns 是否有效
 */
export function validateEncryptedSelection(
  encryptedSelection: EncryptedCaptchaSelection,
  fingerprint: string
): boolean {
  try {
    const { encryptedData, timestamp, hash } = encryptedSelection;
    
    // 检查时间戳有效性（5分钟内）
    const now = Date.now();
    const timeDiff = now - timestamp;
    if (timeDiff < 0 || timeDiff > 5 * 60 * 1000) {
      console.warn('CAPTCHA选择时间戳无效:', { timestamp, now, timeDiff });
      return false;
    }
    
    // 验证完整性哈希
    const expectedHashData = `${encryptedData}_${timestamp}_${fingerprint}`;
    const expectedHash = CryptoJS.SHA256(expectedHashData).toString();
    
    if (hash !== expectedHash) {
      console.warn('CAPTCHA选择哈希验证失败');
      return false;
    }
    
    return true;
  } catch (error) {
    console.error('验证加密选择失败:', error);
    return false;
  }
}

/**
 * 解密CAPTCHA选择（仅用于调试，生产环境应在后端解密）
 * @param encryptedSelection 加密的选择结果
 * @param fingerprint 浏览器指纹
 * @returns 解密的选择结果或null
 */
export function decryptCaptchaSelection(
  encryptedSelection: EncryptedCaptchaSelection,
  fingerprint: string
): CaptchaSelection | null {
  try {
    if (!validateEncryptedSelection(encryptedSelection, fingerprint)) {
      return null;
    }
    
    const { encryptedData, timestamp } = encryptedSelection;
    
    // 生成解密密钥
    const keyMaterial = `${fingerprint}_${Math.floor(timestamp / 60000)}`;
    const decryptionKey = CryptoJS.SHA256(keyMaterial).toString();
    
    // 解密数据
    const decryptedBytes = CryptoJS.AES.decrypt(encryptedData, decryptionKey);
    const decryptedText = decryptedBytes.toString(CryptoJS.enc.Utf8);
    
    if (!decryptedText) {
      console.warn('CAPTCHA选择解密失败');
      return null;
    }
    
    const selection: CaptchaSelection = JSON.parse(decryptedText);
    
    // 验证解密后的数据完整性
    if (selection.timestamp !== timestamp || selection.fingerprint !== fingerprint) {
      console.warn('解密后的CAPTCHA选择数据不一致');
      return null;
    }
    
    return selection;
  } catch (error) {
    console.error('解密CAPTCHA选择失败:', error);
    return null;
  }
}

/**
 * 获取CAPTCHA类型的显示名称
 * @param type CAPTCHA类型
 * @returns 显示名称
 */
export function getCaptchaDisplayName(type: CaptchaType): string {
  switch (type) {
    case CaptchaType.TURNSTILE:
      return 'Cloudflare Turnstile';
    case CaptchaType.HCAPTCHA:
      return 'hCaptcha';
    default:
      return '未知验证方式';
  }
}
