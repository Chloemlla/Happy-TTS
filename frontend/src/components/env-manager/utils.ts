import CryptoJS from 'crypto-js';

export function decryptAES256(encryptedData: string, iv: string, key: string): string {
  try {
    const keyBytes = CryptoJS.SHA256(key);
    const ivBytes = CryptoJS.enc.Hex.parse(iv);
    const encryptedBytes = CryptoJS.enc.Hex.parse(encryptedData);

    const decrypted = CryptoJS.AES.decrypt(
      { ciphertext: encryptedBytes },
      keyBytes,
      {
        iv: ivBytes,
        mode: CryptoJS.mode.CBC,
        padding: CryptoJS.pad.Pkcs7
      }
    );

    return decrypted.toString(CryptoJS.enc.Utf8);
  } catch {
    throw new Error('解密失败');
  }
}

export function getEnvSource(key: string): string | undefined {
  const keyLower = key.toLowerCase();
  const plainKey = keyLower.includes(':') ? keyLower.split(':').pop() || keyLower : keyLower;

  if (
    plainKey === 'google_client_id' ||
    plainKey === 'nexai_google_client_id' ||
    plainKey.includes('google_client') ||
    plainKey.includes('google_auth')
  ) {
    return 'Google Identity Services (GSI) 配置';
  }

  if (
    plainKey.startsWith('nexai_') ||
    plainKey.includes('nexai_github') ||
    plainKey.includes('nexai_frontend')
  ) {
    return 'NexAI OAuth 配置';
  }

  if (keyLower.includes('db_') || keyLower.includes('database_') || keyLower.includes('mongo')) {
    return '数据库配置';
  }

  if (keyLower.includes('email_') || keyLower.includes('mail_') || keyLower.includes('smtp')) {
    return '邮件服务配置';
  }

  if (keyLower.includes('api_') || keyLower.includes('openai') || keyLower.includes('token')) {
    return 'API配置';
  }

  if (keyLower.includes('secret_') || keyLower.includes('key_') || keyLower.includes('password')) {
    return '安全配置';
  }

  if (keyLower.includes('port') || keyLower.includes('host') || keyLower.includes('url')) {
    return '服务器配置';
  }

  if (keyLower.includes('admin_')) {
    return '管理员配置';
  }

  if (keyLower.includes('env') || keyLower.includes('node_env')) {
    return '环境配置';
  }

  return undefined;
}

export const handleSourceClick = (
  source: string,
  setSelectedSource: (source: string) => void,
  setShowSourceModal: (show: boolean) => void,
  options?: {
    storageKey?: string;
    getStorageValue?: () => string;
    onBeforeOpen?: () => void;
    onAfterOpen?: () => void;
  }
) => {
  options?.onBeforeOpen?.();

  const currentScrollY = window.scrollY;
  const storageKey = options?.storageKey || 'envManagerScrollPosition';
  const storageValue = options?.getStorageValue ? options.getStorageValue() : currentScrollY.toString();

  sessionStorage.setItem(storageKey, storageValue);

  setSelectedSource(source);
  setShowSourceModal(true);

  setTimeout(() => {
    const modal = document.querySelector('[data-source-modal]');
    if (modal) {
      modal.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
        inline: 'center'
      });
    }

    options?.onAfterOpen?.();
  }, 100);
};

export const handleSourceModalClose = (
  setShowSourceModal: (show: boolean) => void,
  options?: {
    storageKey?: string;
    getRestoreValue?: () => number;
    onBeforeClose?: () => void;
    onAfterClose?: () => void;
    closeDelay?: number;
  }
) => {
  options?.onBeforeClose?.();

  setShowSourceModal(false);

  setTimeout(() => {
    const storageKey = options?.storageKey || 'envManagerScrollPosition';
    const savedScrollY = sessionStorage.getItem(storageKey);

    if (savedScrollY) {
      const scrollY = options?.getRestoreValue ? options.getRestoreValue() : parseInt(savedScrollY, 10);
      window.scrollTo({
        top: scrollY,
        behavior: 'smooth'
      });
      sessionStorage.removeItem(storageKey);
    }

    options?.onAfterClose?.();
  }, options?.closeDelay || 300);
};
