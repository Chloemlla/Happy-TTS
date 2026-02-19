/**
 * 隐私政策验证工具
 * 提供更安全的验证机制，防止绕过
 */

interface PolicyConsent {
  timestamp: number;
  version: string;
  fingerprint: string;
  checksum: string;
}

class PolicyVerificationSystem {
  private readonly STORAGE_KEY = 'hapxtts_policy_consent';
  private readonly POLICY_VERSION = '2.0';
  private readonly VERIFICATION_ENDPOINT = '/api/policy/verify';
  private readonly MODAL_STORAGE_KEY = 'hapxtts_support_modal_shown';
  
  // 模态框状态管理
  private modalCallbacks: ((show: boolean) => void)[] = [];
  
  // 生成设备指纹
  private async generateFingerprint(): Promise<string> {
    // 检查是否在浏览器环境中
    if (typeof window === 'undefined' || typeof document === 'undefined') {
      throw new Error('Browser environment required for fingerprint generation');
    }

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.textBaseline = 'top';
      ctx.font = '14px Arial';
      ctx.fillText('Policy verification fingerprint', 2, 2);
    }
    
    const fingerprint = [
      navigator.userAgent,
      navigator.language,
      screen.width + 'x' + screen.height,
      new Date().getTimezoneOffset(),
      canvas.toDataURL(),
      navigator.hardwareConcurrency || 0,
      navigator.maxTouchPoints || 0
    ].join('|');
    
    return await this.sha256Hash(fingerprint);
  }
  
  // SHA256哈希函数（与后端保持一致）
  private async sha256Hash(str: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(str);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    return hashHex.substring(0, 8); // 取前8位，与后端保持一致
  }
  
  // 生成校验和（与后端保持一致）
  private async generateChecksum(consent: Omit<PolicyConsent, 'checksum'>): Promise<string> {
    const data = `${consent.timestamp}|${consent.version}|${consent.fingerprint}`;
    return await this.sha256Hash(data + 'hapxtts_secret_salt');
  }
  
  // 验证校验和
  private async verifyChecksum(consent: PolicyConsent): Promise<boolean> {
    const expectedChecksum = await this.generateChecksum({
      timestamp: consent.timestamp,
      version: consent.version,
      fingerprint: consent.fingerprint
    });
    return consent.checksum === expectedChecksum;
  }
  
  // 检查是否已同意最新版本的隐私政策（必须从服务器验证）
  public async hasValidConsent(): Promise<boolean> {
    // 检查是否在浏览器环境中
    if (typeof window === 'undefined') {
      return false;
    }

    try {
      // 生成当前设备指纹
      const currentFingerprint = await this.generateFingerprint();
      
      console.info('Checking consent status - server verification only');
      
      // 直接从服务器验证，不依赖本地存储
      const serverValid = await this.verifyConsentWithServer(currentFingerprint);
      
      if (!serverValid) {
        console.warn('Server validation failed, clearing any local consent');
        this.clearConsent();
        return false;
      }
      
      console.info('Server validation passed');
      return true;
      
    } catch (error) {
      console.error('Error checking policy consent:', error);
      this.clearConsent();
      return false;
    }
  }
  
  // 记录用户同意
  public async recordConsent(): Promise<void> {
    // 检查是否在浏览器环境中
    if (typeof window === 'undefined' || typeof localStorage === 'undefined') {
      throw new Error('Browser environment required for consent recording');
    }

    try {
      const fingerprint = await this.generateFingerprint();
      const timestamp = Date.now();
      
      const consent: Omit<PolicyConsent, 'checksum'> = {
        timestamp,
        version: this.POLICY_VERSION,
        fingerprint
      };
      
      const checksum = await this.generateChecksum(consent);
      const fullConsent: PolicyConsent = { ...consent, checksum };
      
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(fullConsent));
      
      // 异步发送到服务器记录（如果有后端支持）
      this.sendConsentToServer(fullConsent).catch(err => {
        console.warn('Failed to send consent to server:', err);
      });
      
    } catch (error) {
      console.error('Error recording policy consent:', error);
    }
  }
  
  // 清除同意记录
  public clearConsent(): void {
    // 检查是否在浏览器环境中
    if (typeof window === 'undefined' || typeof localStorage === 'undefined') {
      return;
    }

    try {
      localStorage.removeItem(this.STORAGE_KEY);
      // 清除旧版本的存储
      localStorage.removeItem('hapxtts_support_modal_shown');
    } catch (error) {
      console.error('Error clearing policy consent:', error);
    }
  }
  
  // 发送同意记录到服务器（可选）
  private async sendConsentToServer(consent: PolicyConsent): Promise<void> {
    // 检查是否在浏览器环境中
    if (typeof window === 'undefined' || typeof navigator === 'undefined') {
      return;
    }

    try {
      const baseUrl = this.getApiBaseUrl();
      const fullUrl = `${baseUrl}${this.VERIFICATION_ENDPOINT}`;
      
      const response = await fetch(fullUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include', // 包含cookies用于跨域认证
        body: JSON.stringify({
          consent,
          userAgent: navigator.userAgent,
          timestamp: Date.now()
        })
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(`Server response: ${response.status} - ${errorData.error || 'Unknown error'}`);
      }
      
      const result = await response.json();
      console.log('Policy consent recorded on server:', result);
      
    } catch (error) {
      // 服务器记录失败不影响客户端功能
      console.warn('Server consent recording failed:', error);
    }
  }
  
  // 从服务器验证同意状态（必选）
  public async verifyConsentWithServer(fingerprint?: string): Promise<boolean> {
    // 检查是否在浏览器环境中
    if (typeof window === 'undefined') {
      return false;
    }

    const startTime = Date.now();
    
    try {
      const baseUrl = this.getApiBaseUrl();
      const currentFingerprint = fingerprint || await this.generateFingerprint();
      const url = `${baseUrl}/api/policy/check?fingerprint=${encodeURIComponent(currentFingerprint)}&version=${encodeURIComponent(this.POLICY_VERSION)}`;
      
      console.info('Verifying consent with server:', {
        fingerprint: currentFingerprint.substring(0, 8) + '...',
        version: this.POLICY_VERSION,
        url: url.replace(currentFingerprint, '***')
      });
      
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        // 设置超时
        signal: AbortSignal.timeout(10000) // 10秒超时
      });
      
      const responseTime = Date.now() - startTime;
      
      if (!response.ok) {
        console.error('Server consent verification failed:', {
          status: response.status,
          statusText: response.statusText,
          responseTime: `${responseTime}ms`
        });
        
        // 如果是网络错误，可能需要降级到本地验证
        if (response.status >= 500) {
          console.warn('Server error detected, this may indicate service unavailability');
        }
        
        return false;
      }
      
      const result = await response.json();
      
      console.info('Server consent verification completed:', {
        success: result.success,
        hasValidConsent: result.hasValidConsent,
        responseTime: `${responseTime}ms`,
        consentId: result.consentId?.substring(0, 8) + '...' || 'N/A',
        expiresAt: result.expiresAt
      });
      
      // 如果服务器返回成功但同意无效，记录详细信息
      if (result.success && !result.hasValidConsent) {
        console.info('Server indicates no valid consent:', {
          message: result.message,
          currentVersion: result.currentVersion
        });
      }
      
      return result.success && result.hasValidConsent;
      
    } catch (error) {
      const responseTime = Date.now() - startTime;
      
      if (error.name === 'AbortError') {
        console.error('Server consent verification timeout:', {
          timeout: '10s',
          responseTime: `${responseTime}ms`
        });
      } else {
        console.error('Server consent verification error:', {
          error: error.message,
          responseTime: `${responseTime}ms`,
          type: error.name
        });
      }
      
      // 网络错误时返回false，强制重新同意
      return false;
    }
  }

  // 本地验证已移除 - 所有验证必须通过服务器

  // 带降级策略的验证（服务器不可用时直接失败）
  public async hasValidConsentWithFallback(): Promise<boolean> {
    // 检查是否在浏览器环境中
    if (typeof window === 'undefined') {
      return false;
    }

    try {
      // 只使用服务器验证，不提供本地降级
      const serverValid = await this.hasValidConsent();
      return serverValid;
    } catch (error) {
      console.error('Server validation failed, no fallback available:', error);
      
      // 服务器验证失败时，直接返回false，强制用户重新同意
      console.warn('⚠️ 服务器验证失败，需要重新同意隐私政策');
      
      // 清除任何本地缓存
      this.clearConsent();
      
      return false;
    }
  }

  // 获取当前政策版本
  public getPolicyVersion(): string {
    return this.POLICY_VERSION;
  }
  
  // 检查是否为开发环境
  public isDevelopment(): boolean {
    // 检查是否在浏览器环境中
    if (typeof window === 'undefined') {
      return process.env.NODE_ENV === 'development';
    }

    return process.env.NODE_ENV === 'development' || 
           window.location.hostname === 'localhost' ||
           window.location.hostname === '127.0.0.1';
  }
  
  // 防篡改检查
  public performIntegrityCheck(): boolean {
    // 检查是否在浏览器环境中
    if (typeof window === 'undefined' || typeof localStorage === 'undefined') {
      return true; // 在服务器环境中返回true，避免阻塞SSR
    }

    try {
      // 检查关键函数是否被修改
      const originalSetItem = localStorage.setItem;
      const originalGetItem = localStorage.getItem;
      
      // 简单的完整性检查
      if (typeof originalSetItem !== 'function' || typeof originalGetItem !== 'function') {
        console.warn('localStorage methods have been modified');
        return false;
      }
      
      // 检查开发者工具
      let devtools = false;
      const threshold = 160;
      
      setInterval(() => {
        if (window.outerHeight - window.innerHeight > threshold || 
            window.outerWidth - window.innerWidth > threshold) {
          devtools = true;
        }
      }, 500);
      
      return !devtools;
    } catch (error) {
      console.error('Integrity check failed:', error);
      return false;
    }
  }

  // 模态框管理方法
  public registerModalCallback(callback: (show: boolean) => void): void {
    this.modalCallbacks.push(callback);
  }

  public unregisterModalCallback(callback: (show: boolean) => void): void {
    this.modalCallbacks = this.modalCallbacks.filter(cb => cb !== callback);
  }

  public showModal(): void {
    this.modalCallbacks.forEach(callback => callback(true));
  }

  public hideModal(): void {
    this.modalCallbacks.forEach(callback => callback(false));
  }

  // 检查是否应该显示模态框
  public shouldShowModal(): boolean {
    if (typeof window === 'undefined' || typeof localStorage === 'undefined') {
      console.log('Browser environment not available, modal will not be shown');
      return false;
    }

    try {
      const hasShown = localStorage.getItem(this.MODAL_STORAGE_KEY);
      const shouldShow = !hasShown;
      
      console.log('Modal display check:', {
        storageKey: this.MODAL_STORAGE_KEY,
        hasShown: hasShown,
        shouldShow: shouldShow
      });
      
      return shouldShow;
    } catch (error) {
      console.error('Error checking modal status:', error);
      return false;
    }
  }

  // 标记模态框已显示
  public markModalAsShown(): void {
    if (typeof window === 'undefined' || typeof localStorage === 'undefined') {
      return;
    }

    try {
      localStorage.setItem(this.MODAL_STORAGE_KEY, '1');
      console.log('Modal marked as shown in localStorage:', this.MODAL_STORAGE_KEY);
    } catch (error) {
      console.error('Error marking modal as shown:', error);
    }
  }

  // 清除模态框显示状态（用于测试或重置）
  public clearModalStatus(): void {
    if (typeof window === 'undefined' || typeof localStorage === 'undefined') {
      return;
    }

    try {
      localStorage.removeItem(this.MODAL_STORAGE_KEY);
      console.log('Modal status cleared from localStorage:', this.MODAL_STORAGE_KEY);
    } catch (error) {
      console.error('Error clearing modal status:', error);
    }
  }

  // 获取模态框显示状态（用于调试）
  public getModalStatus(): string | null {
    if (typeof window === 'undefined' || typeof localStorage === 'undefined') {
      return null;
    }

    try {
      return localStorage.getItem(this.MODAL_STORAGE_KEY);
    } catch (error) {
      console.error('Error getting modal status:', error);
      return null;
    }
  }

  // 初始化隐私政策检查
  public async initializePolicyCheck(): Promise<boolean> {
    if (typeof window === 'undefined') {
      return false;
    }

    try {
      // 检查是否已经显示过模态框
      const shouldShow = this.shouldShowModal();
      
      if (!shouldShow) {
        console.log('Modal already shown before, skipping display');
        return true;
      }

      // 如果还没有显示过模态框，显示一次并立即标记为已显示
      console.log('Showing modal for first time (regardless of consent status)');
      this.showModal();
      
      // 立即标记模态框已显示，防止重复显示
      this.markModalAsShown();
      
      return false;
    } catch (error) {
      console.error('Error initializing policy check:', error);
      this.showModal();
      // 即使出错也要标记为已显示，避免无限循环
      this.markModalAsShown();
      return false;
    }
  }

  // 处理用户同意
  public async handleUserConsent(): Promise<void> {
    try {
      // 记录用户同意
      await this.recordConsent();
      
      // 标记模态框已显示（防止重复显示）
      this.markModalAsShown();
      
      // 隐藏模态框
      this.hideModal();
      
      console.log('Policy consent recorded successfully, modal will not show again');
    } catch (error) {
      console.error('Error handling user consent:', error);
      throw error;
    }
  }

  // 获取API基础URL（与api.ts保持一致）
  private getApiBaseUrl(): string {
    // 检查是否在浏览器环境中
    if (typeof window === 'undefined') {
      // 在服务器环境中，使用默认值
      return 'https://api.951100.xyz';
    }

    // 检查是否为本地地址特征（优先判断）
    const currentHost = window.location.hostname;
    const currentPort = window.location.port;
    
    // 检查是否为本地地址特征
    const isLocalAddress = currentHost === 'localhost' || 
                           currentHost === '127.0.0.1' || 
                           currentHost.startsWith('192.168.') ||
                           currentHost.startsWith('10.') ||
                           currentHost.startsWith('172.');
    
    // 检查端口是否为本地开发端口
    const isLocalPort = currentPort === '3001' || 
                       currentPort === '3002' || 
                       currentPort === '6000' || 
                       currentPort === '6001';
    
    // 如果是本地地址或本地端口，直接使用 localhost:3000
    if (isLocalAddress || isLocalPort) {
      console.log('Detected local environment, using localhost:3000', {
        hostname: currentHost,
        port: currentPort,
        isLocalAddress,
        isLocalPort
      });
      return 'http://localhost:3000';
    }

    // 检查 NODE_ENV（作为备用判断）
    const isDev = typeof process !== 'undefined' && process.env?.NODE_ENV === 'development';
    
    if (isDev) {
      console.log('Development environment detected via NODE_ENV, using localhost:3000');
      return 'http://localhost:3000';
    }

    // 生产环境
    console.log('Production environment detected, using api.951100.xyz');
    return 'https://api.951100.xyz';
  }
}

// 导出单例实例
export const policyVerification = new PolicyVerificationSystem();

// 导出类型
export type { PolicyConsent };

