import { TOTPErrorResponse } from '../types/auth';

/**
 * 处理TOTP错误响应
 */
export const handleTOTPError = (error: any): string => {
  const errorData = error.response?.data as TOTPErrorResponse;
  
  if (error.response?.status === 429) {
    // 验证尝试次数过多
    const remainingTime = Math.ceil((errorData.lockedUntil! - Date.now()) / 1000 / 60);
    return `验证尝试次数过多，请${remainingTime}分钟后再试`;
  } else if (errorData?.remainingAttempts !== undefined) {
    // 显示剩余尝试次数
    const remainingAttempts = errorData.remainingAttempts;
    let message = '';
    
    if (remainingAttempts === 0) {
      const remainingTime = Math.ceil((errorData.lockedUntil! - Date.now()) / 1000 / 60);
      message = `验证码错误，账户已被锁定，请${remainingTime}分钟后再试`;
    } else {
      message = `验证码错误，还剩${remainingAttempts}次尝试机会`;
    }
    
    return message;
  } else {
    return errorData?.error || '验证失败';
  }
};

/**
 * 验证TOTP验证码格式
 */
export const validateTOTPToken = (token: string): boolean => {
  return /^\d{6}$/.test(token);
};

/**
 * 验证备用恢复码格式
 */
export const validateBackupCode = (code: string): boolean => {
  return /^[A-Z0-9]{8}$/.test(code.toUpperCase());
};

/**
 * 清理TOTP验证码输入
 */
export const cleanTOTPToken = (input: string): string => {
  return input.replace(/\D/g, '').slice(0, 6);
};

/**
 * 清理备用恢复码输入
 */
export const cleanBackupCode = (input: string): string => {
  return input.replace(/[^A-Z0-9]/g, '').toUpperCase().slice(0, 8);
};

/**
 * 格式化剩余时间
 */
export const formatRemainingTime = (lockedUntil: number): string => {
  const remainingSeconds = Math.ceil((lockedUntil - Date.now()) / 1000);
  const minutes = Math.floor(remainingSeconds / 60);
  const seconds = remainingSeconds % 60;
  
  if (minutes > 0) {
    return `${minutes}分${seconds}秒`;
  } else {
    return `${seconds}秒`;
  }
};

/**
 * 检查是否在锁定期间
 */
export const isLockedOut = (lockedUntil?: number): boolean => {
  if (!lockedUntil) return false;
  return Date.now() < lockedUntil;
}; 