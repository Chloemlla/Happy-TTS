import '../lang/index.js' // 自动生成的语言配置，需置于入口第一行
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'
import { integrityChecker } from './utils/integrityCheck'
import { disableSelection } from './utils/disableSelection'
import CryptoJS from 'crypto-js'

// AES-256 解密函数（前端版本）
function decryptAES256(encryptedData: string, iv: string, key: string): string {
  try {
    const keyHash = CryptoJS.SHA256(key);
    const ivBytes = CryptoJS.enc.Hex.parse(iv);
    const encryptedBytes = CryptoJS.enc.Hex.parse(encryptedData);
    
    const decrypted = CryptoJS.AES.decrypt(
      { ciphertext: encryptedBytes },
      keyHash,
      {
        iv: ivBytes,
        mode: CryptoJS.mode.CBC,
        padding: CryptoJS.pad.Pkcs7
      }
    );
    
    return decrypted.toString(CryptoJS.enc.Utf8);
  } catch (error) {
    console.error('AES-256 解密失败:', error);
    throw new Error('解密失败');
  }
}

// 辅助：带401重试的 fetch（401 时最多重试两次，总共最多三次，403 时立即停止）
async function fetchWithAuthRetry(input: RequestInfo | URL, init?: RequestInit, max401Retries: number = 2): Promise<Response> {
  let attempt = 0;
  let res: Response;
  do {
    res = await fetch(input, init);
    // 如果返回403，立即停止，不再重试
    if (res.status === 403) {
      console.log('🚫 收到403状态码，用户没有权限，停止请求');
      return res;
    }
    if (res.status !== 401) return res;
    attempt++;
  } while (attempt <= max401Retries);
  return res;
}

// 调试控制台验证机制
interface DebugConsoleConfig {
  enabled: boolean;
  keySequence: string;
  verificationCode: string;
  maxAttempts: number;
  lockoutDuration: number; // 毫秒
  updatedAt?: Date;
}

// 默认调试控制台配置
const DEFAULT_DEBUG_CONFIG: DebugConsoleConfig = {
  enabled: true,
  keySequence: '91781145',
  verificationCode: '123456',
  maxAttempts: 5,
  lockoutDuration: 30 * 60 * 1000, // 30分钟
  updatedAt: new Date()
};

// 调试控制台状态管理
class DebugConsoleManager {
  private static instance: DebugConsoleManager;
  private config: DebugConsoleConfig;
  private keyBuffer: string = '';
  private attempts: number = 0;
  private lockoutUntil: number = 0;
  private isDebugMode: boolean = false;

  private constructor() {
    this.config = this.loadConfig();
    this.attempts = this.loadAttempts();
    this.lockoutUntil = this.loadLockoutUntil();
    this.isDebugMode = this.loadDebugMode();
    
    // 启动配置同步
    this.startConfigSync();
  }

  public static getInstance(): DebugConsoleManager {
    if (!DebugConsoleManager.instance) {
      DebugConsoleManager.instance = new DebugConsoleManager();
    }
    return DebugConsoleManager.instance;
  }

  private loadConfig(): DebugConsoleConfig {
    try {
      const stored = localStorage.getItem('debug_console_config');
      if (stored) {
        const parsed = JSON.parse(stored);
        return { ...DEFAULT_DEBUG_CONFIG, ...parsed };
      }
    } catch (error) {
      console.warn('加载调试控制台配置失败:', error);
    }
    return DEFAULT_DEBUG_CONFIG;
  }

  private saveConfig(): void {
    try {
      localStorage.setItem('debug_console_config', JSON.stringify(this.config));
    } catch (error) {
      console.warn('保存调试控制台配置失败:', error);
    }
  }

  private loadAttempts(): number {
    try {
      const stored = localStorage.getItem('debug_console_attempts');
      return stored ? parseInt(stored, 10) : 0;
    } catch (error) {
      console.warn('加载调试控制台尝试次数失败:', error);
      return 0;
    }
  }

  private saveAttempts(): void {
    try {
      localStorage.setItem('debug_console_attempts', this.attempts.toString());
    } catch (error) {
      console.warn('保存调试控制台尝试次数失败:', error);
    }
  }

  private loadLockoutUntil(): number {
    try {
      const stored = localStorage.getItem('debug_console_lockout');
      return stored ? parseInt(stored, 10) : 0;
    } catch (error) {
      console.warn('加载调试控制台锁定时间失败:', error);
      return 0;
    }
  }

  private saveLockoutUntil(): void {
    try {
      localStorage.setItem('debug_console_lockout', this.lockoutUntil.toString());
    } catch (error) {
      console.warn('保存调试控制台锁定时间失败:', error);
    }
  }

  private loadDebugMode(): boolean {
    try {
      const stored = localStorage.getItem('debug_console_mode');
      return stored === 'true';
    } catch (error) {
      console.warn('加载调试控制台模式失败:', error);
      return false;
    }
  }

  private saveDebugMode(): void {
    try {
      localStorage.setItem('debug_console_mode', this.isDebugMode.toString());
    } catch (error) {
      console.warn('保存调试控制台模式失败:', error);
    }
  }

  // 检查用户是否为管理员
  private isUserAdmin(): boolean {
    try {
      const token = localStorage.getItem('token');
      if (!token) return false;
      
      // 简单的token存在性检查，实际项目中可能需要更复杂的验证
      return token.length > 10; // 假设有效token长度大于10
    } catch (error) {
      return false;
    }
  }

  // 从后端同步配置
  public async syncConfigFromBackend(): Promise<void> {
    try {
      // 检查用户是否为管理员，非管理员用户不进行配置同步
      if (!this.isUserAdmin()) {
        console.log('[调试控制台] 用户非管理员，跳过配置同步');
        return;
      }

      // 获取认证token
      const token = localStorage.getItem('token');
      const headers: Record<string, string> = {
        'Content-Type': 'application/json'
      };
      
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      // 尝试获取加密配置（401 最多重试两次）
      let response = await fetchWithAuthRetry('/api/debug-console/configs/encrypted', {
        headers
      }, 2);
      
      if (response.status === 401) {
        console.log('⚠️ 同步配置需要管理员权限，跳过自动同步');
        return;
      }
      
      // 如果返回403，说明用户没有权限，停止后续请求
      if (response.status === 403) {
        console.log('🚫 用户没有调试控制台权限，停止配置同步');
        return;
      }
      
      let data: any = null;
      let configs: any[] = [];
      
      if (response.ok) {
        data = await response.json();
        if (data.success && data.data && data.iv) {
          try {
            // 解密配置数据
            const decryptedJson = decryptAES256(data.data, data.iv, token!);
            const decryptedData = JSON.parse(decryptedJson);
            
            if (Array.isArray(decryptedData)) {
              configs = decryptedData;
            }
          } catch (decryptError) {
            console.warn('解密配置失败，尝试获取未加密配置:', decryptError);
          }
        }
      }
      
      // 如果加密配置获取失败，回退到未加密配置（401 最多重试两次）
      if (configs.length === 0) {
        response = await fetchWithAuthRetry('/api/debug-console/configs', {
          headers
        }, 2);
        
        // 如果返回403，说明用户没有权限，停止后续请求
        if (response.status === 403) {
          console.log('🚫 用户没有调试控制台权限，停止配置同步');
          return;
        }
        
        if (response.ok) {
          data = await response.json();
          if (data.success && data.data && data.data.length > 0) {
            configs = data.data;
          }
        }
      }
      
      if (configs.length > 0) {
        // 获取默认配置或第一个配置
        const backendConfig = configs.find((config: any) => config.group === 'default') || configs[0];
        
        // 检查配置是否有变化
        const oldConfig = { ...this.config };
        const newConfig = {
          ...this.config,
          enabled: backendConfig.enabled,
          keySequence: backendConfig.keySequence,
          verificationCode: backendConfig.verificationCode,
          maxAttempts: backendConfig.maxAttempts,
          lockoutDuration: backendConfig.lockoutDuration,
          updatedAt: new Date()
        };
        
        // 检查关键配置是否发生变化
        const configChanged = 
          oldConfig.enabled !== newConfig.enabled ||
          oldConfig.keySequence !== newConfig.keySequence ||
          oldConfig.verificationCode !== newConfig.verificationCode ||
          oldConfig.maxAttempts !== newConfig.maxAttempts ||
          oldConfig.lockoutDuration !== newConfig.lockoutDuration;
        
        // 更新配置
        this.config = newConfig;
        this.saveConfig();
        
        if (configChanged) {
          console.log('🔄 调试控制台配置已更新，重新初始化相关状态');
          
          // 如果配置被禁用，清除调试模式
          if (!this.config.enabled && this.isDebugMode) {
            this.disableDebugMode();
          }
          
          // 如果按键序列发生变化，清空当前缓冲区并重置状态
          if (oldConfig.keySequence !== newConfig.keySequence) {
            this.keyBuffer = '';
            console.log('🔄 按键序列已更新，缓冲区已清空');
            console.log(`   新序列: ${newConfig.keySequence}`);
            console.log(`   旧序列: ${oldConfig.keySequence}`);
          }
          
          // 如果最大尝试次数或锁定时间发生变化，重置尝试次数
          if (oldConfig.maxAttempts !== newConfig.maxAttempts || 
              oldConfig.lockoutDuration !== newConfig.lockoutDuration) {
            this.attempts = 0;
            this.saveAttempts();
            console.log('🔄 尝试次数限制已更新，尝试次数已重置');
          }
        } else {
          console.log('✅ 调试控制台配置已从后端同步（无变化）');
        }
      } else {
        console.warn('从后端同步调试控制台配置失败:', response.status, response.statusText);
      }
    } catch (error) {
      console.warn('从后端同步调试控制台配置失败:', error);
    }
  }

  // 启动配置同步机制
  private startConfigSync(): void {
    // 检查用户是否为管理员，非管理员用户不启动配置同步
    if (!this.isUserAdmin()) {
      console.log('[调试控制台] 用户非管理员，跳过配置同步机制启动');
      return;
    }
    
    // 立即同步一次
    this.syncConfigFromBackend();
    
    // 每5分钟同步一次配置
    const syncInterval = setInterval(() => {
      this.syncConfigFromBackend().catch(() => {
        // 如果同步失败，停止定时器
        clearInterval(syncInterval);
      });
    }, 5 * 60 * 1000);
    
    // 监听页面可见性变化，当页面重新可见时同步配置
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) {
        this.syncConfigFromBackend();
      }
    });
    
    // 监听窗口焦点变化，当窗口重新获得焦点时同步配置
    window.addEventListener('focus', () => {
      this.syncConfigFromBackend();
    });
  }

  // 检查是否有管理员权限
  private hasAdminPermission(): boolean {
    try {
      const token = localStorage.getItem('token');
      if (!token) return false;
      
      // 简单的token存在性检查，实际项目中可能需要更复杂的验证
      return token.length > 10; // 假设有效token长度大于10
    } catch (error) {
      return false;
    }
  }

  // 手动触发配置同步（用于调试）
  public forceSyncConfig(): Promise<void> {
    // 检查用户是否为管理员，非管理员用户不进行手动同步
    if (!this.isUserAdmin()) {
      console.log('[调试控制台] 用户非管理员，跳过手动配置同步');
      return Promise.resolve();
    }
    
    console.log('🔄 手动触发配置同步...');
    return this.syncConfigFromBackend();
  }

  public handleKeyPress(key: string): boolean {
    if (!this.config.enabled) return false;
    
    // 检查用户是否为管理员，非管理员用户不处理按键序列
    if (!this.isUserAdmin()) {
      return false;
    }
    
    // 检查是否在锁定状态
    if (this.isLocked()) {
      console.warn('调试控制台已锁定，请稍后再试');
      return false;
    }

    // 添加到按键缓冲区
    this.keyBuffer += key;
    
    // 保持缓冲区长度不超过序列长度
    if (this.keyBuffer.length > this.config.keySequence.length) {
      this.keyBuffer = this.keyBuffer.slice(-this.config.keySequence.length);
    }

    // 检查是否匹配按键序列
    if (this.keyBuffer === this.config.keySequence) {
      console.log('检测到调试控制台按键序列，请输入验证码');
      this.showVerificationPrompt();
      this.keyBuffer = '';
      return true;
    }

    // 调试模式下显示按键进度（仅在调试模式下显示，避免干扰）
    if (this.isDebugMode && this.keyBuffer.length > 0) {
      const progress = Math.round((this.keyBuffer.length / this.config.keySequence.length) * 100);
      console.log(`🔧 按键进度: ${progress}% (${this.keyBuffer.length}/${this.config.keySequence.length})`);
    }

    // 检查是否需要重置缓冲区
    // 如果缓冲区长度等于序列长度但不匹配，清空缓冲区重新开始
    if (this.keyBuffer.length === this.config.keySequence.length) {
      this.keyBuffer = '';
      if (this.isDebugMode) {
        console.log('🔄 按键序列不匹配，缓冲区已重置');
      }
    }

    return false;
  }

  // 检查调试控制台是否可以重新激活
  public canReactivate(): boolean {
    return this.config.enabled && !this.isLocked();
  }

  private isLocked(): boolean {
    return Date.now() < this.lockoutUntil;
  }

  private showVerificationPrompt(): void {
    const code = prompt('请输入调试控制台验证码:');
    if (code !== null) {
      this.verifyCode(code);
    }
  }

  private async verifyCode(inputCode: string): Promise<void> {
    try {
      // 检查用户是否为管理员，非管理员用户不进行验证
      if (!this.isUserAdmin()) {
        console.log('[调试控制台] 用户非管理员，跳过验证码验证');
        return;
      }

      // 获取当前按键序列
      const keySequence = this.keyBuffer || this.config.keySequence;
      
      // 调用后端 API 验证
      const response = await fetch('/api/debug-console/verify', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          keySequence,
          verificationCode: inputCode
        })
      });

      // 如果返回403，说明用户没有权限，停止验证
      if (response.status === 403) {
        console.log('🚫 用户没有调试控制台权限，验证失败');
        return;
      }

      const result = await response.json();

      if (result.success) {
        this.isDebugMode = true;
        this.saveDebugMode();
        this.attempts = 0;
        this.saveAttempts();
        this.lockoutUntil = 0;
        this.saveLockoutUntil();
        
        // 验证成功后，重置按键缓冲区，确保可以重新触发
        this.keyBuffer = '';
        
        console.log('✅ 调试控制台验证成功！');
        console.log('🔧 调试模式已启用');
        console.log('📝 可用的调试命令:');
        console.log('  - debug.help() - 显示帮助信息');
        console.log('  - debug.config() - 显示当前配置');
        console.log('  - debug.reset() - 重置配置');
        console.log('  - debug.disable() - 禁用调试模式');
        console.log('  - debug.api() - 显示API接口信息');
        console.log('  - debug.sync() - 同步后端配置');
        console.log('  - debug.forceSync() - 强制同步后端配置');
        console.log('  - debug.buffer() - 显示按键缓冲区状态');
        console.log('  - debug.resetBuffer() - 重置按键缓冲区');
        console.log('  - debug.reactivate() - 重新激活调试控制台');
        console.log('🔧 如果开发者工具未自动打开，请手动按 F12 或 Ctrl+Shift+I');
        
        // 暴露调试接口到全局
        const debugConsoleManager = this;
        (window as any).debug = {
          help: () => debugConsoleManager.showHelp(),
          config: () => debugConsoleManager.showConfig(),
          reset: () => debugConsoleManager.resetConfig(),
          disable: () => debugConsoleManager.disableDebugMode(),
          status: () => debugConsoleManager.showStatus(),
          api: () => debugConsoleManager.showApiInfo(),
          sync: () => debugConsoleManager.syncConfigFromBackend(),
          forceSync: () => debugConsoleManager.forceSyncConfig(),
          buffer: () => debugConsoleManager.showBufferStatus(),
          resetBuffer: () => debugConsoleManager.resetKeyBuffer(),
          reactivate: () => debugConsoleManager.reactivate()
        };

        // 启用选择功能和右键菜单
        this.toggleSelection(true);

        // 立即更新权限状态
        if ((window as any).updateDebugPermissions) {
          (window as any).updateDebugPermissions();
        }

        // 尝试自动打开开发者工具
        this.tryOpenDevTools();
      } else {
        this.attempts++;
        this.saveAttempts();
        
        if (result.lockoutUntil) {
          this.lockoutUntil = new Date(result.lockoutUntil).getTime();
          this.saveLockoutUntil();
          console.error(`❌ 验证码错误次数过多，调试控制台已锁定 ${Math.ceil((this.lockoutUntil - Date.now()) / 1000 / 60)} 分钟`);
        } else {
          console.error(`❌ 验证码错误，剩余尝试次数: ${result.attempts || 0}`);
        }
      }
    } catch (error) {
      console.error('❌ 验证请求失败:', error);
      // 回退到本地验证
      if (inputCode === this.config.verificationCode) {
        this.isDebugMode = true;
        this.saveDebugMode();
        this.attempts = 0;
        this.saveAttempts();
        this.lockoutUntil = 0;
        this.saveLockoutUntil();
        
        // 验证成功后，重置按键缓冲区，确保可以重新触发
        this.keyBuffer = '';
        
        console.log('✅ 调试控制台验证成功（本地模式）！');
        console.log('🔧 调试模式已启用');
        console.log('🔧 如果开发者工具未自动打开，请手动按 F12 或 Ctrl+Shift+I');
        
        // 暴露调试接口到全局
        const debugConsoleManager = this;
        (window as any).debug = {
          help: () => debugConsoleManager.showHelp(),
          config: () => debugConsoleManager.showConfig(),
          reset: () => debugConsoleManager.resetConfig(),
          disable: () => debugConsoleManager.disableDebugMode(),
          status: () => debugConsoleManager.showStatus(),
          api: () => debugConsoleManager.showApiInfo(),
          sync: () => debugConsoleManager.syncConfigFromBackend(),
          forceSync: () => debugConsoleManager.forceSyncConfig(),
          buffer: () => debugConsoleManager.showBufferStatus(),
          resetBuffer: () => debugConsoleManager.resetKeyBuffer(),
          reactivate: () => debugConsoleManager.reactivate()
        };

        // 启用选择功能和右键菜单
        this.toggleSelection(true);

        // 立即更新权限状态
        if ((window as any).updateDebugPermissions) {
          (window as any).updateDebugPermissions();
        }

        // 尝试自动打开开发者工具
        this.tryOpenDevTools();
      } else {
        this.attempts++;
        this.saveAttempts();
        
        const remainingAttempts = this.config.maxAttempts - this.attempts;
        
        if (remainingAttempts <= 0) {
          this.lockoutUntil = Date.now() + this.config.lockoutDuration;
          this.saveLockoutUntil();
          console.error(`❌ 验证码错误次数过多，调试控制台已锁定 ${this.config.lockoutDuration / 1000 / 60} 分钟`);
        } else {
          console.error(`❌ 验证码错误，剩余尝试次数: ${remainingAttempts}`);
        }
      }
    }
  }

  // 尝试自动打开开发者工具
  private tryOpenDevTools(): void {
    try {
      // 方法1: 使用 F12 快捷键模拟
      const f12Event = new KeyboardEvent('keydown', {
        key: 'F12',
        code: 'F12',
        keyCode: 123,
        which: 123,
        bubbles: true,
        cancelable: true
      });
      document.dispatchEvent(f12Event);

      // 方法2: 使用 Ctrl+Shift+I 快捷键模拟
      setTimeout(() => {
        const ctrlShiftIEvent = new KeyboardEvent('keydown', {
          key: 'I',
          code: 'KeyI',
          keyCode: 73,
          which: 73,
          ctrlKey: true,
          shiftKey: true,
          bubbles: true,
          cancelable: true
        });
        document.dispatchEvent(ctrlShiftIEvent);
      }, 100);

      // 方法3: 使用 Ctrl+Shift+J 快捷键模拟（打开控制台）
      setTimeout(() => {
        const ctrlShiftJEvent = new KeyboardEvent('keydown', {
          key: 'J',
          code: 'KeyJ',
          keyCode: 74,
          which: 74,
          ctrlKey: true,
          shiftKey: true,
          bubbles: true,
          cancelable: true
        });
        document.dispatchEvent(ctrlShiftJEvent);
      }, 200);

      // 方法4: 尝试直接调用开发者工具API（仅在某些浏览器中有效）
      setTimeout(() => {
        try {
          // @ts-ignore - 某些浏览器可能有这个API
          if (window.devtools && typeof window.devtools.open === 'function') {
            // @ts-ignore
            window.devtools.open();
          }
        } catch (e) {
          // 忽略错误
        }
      }, 300);

      // 方法5: 创建可见的提示按钮
      this.createDevToolsPrompt();

      console.log('🔧 已尝试自动打开开发者工具，如果未自动打开请手动按 F12');
    } catch (error) {
      console.warn('⚠️ 自动打开开发者工具失败，请手动按 F12:', error);
    }
  }

  // 检查开发者工具是否已经打开
  private isDevToolsOpen(): boolean {
    try {
      // 方法1: 检查窗口大小变化
      const threshold = 160;
      const widthThreshold = window.outerWidth - window.innerWidth > threshold;
      const heightThreshold = window.outerHeight - window.innerHeight > threshold;
      
      // 方法2: 检查控制台是否打开（通过console.log的时间差）
      let devtools = {
        open: false,
        orientation: null as string | null
      };
      
      const start = performance.now();
      console.log('%c', 'color: transparent');
      const end = performance.now();
      
      // 如果console.log执行时间超过100ms，可能开发者工具已打开
      const timeThreshold = end - start > 100;
      
      return widthThreshold || heightThreshold || timeThreshold;
    } catch (error) {
      return false;
    }
  }

  // 创建开发者工具提示按钮
  private createDevToolsPrompt(): void {
    try {
      // 检查开发者工具是否已经打开
      if (this.isDevToolsOpen()) {
        console.log('🔧 开发者工具已经打开，跳过提示');
        return;
      }

      // 移除已存在的提示
      const existingPrompt = document.getElementById('debug-console-prompt');
      if (existingPrompt) {
        existingPrompt.remove();
      }

      // 创建提示容器
      const prompt = document.createElement('div');
      prompt.id = 'debug-console-prompt';
      prompt.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        color: white;
        padding: 15px 20px;
        border-radius: 10px;
        box-shadow: 0 4px 20px rgba(0,0,0,0.15);
        z-index: 999999;
        font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
        font-size: 14px;
        max-width: 300px;
        animation: slideInRight 0.5s ease-out;
      `;

      prompt.innerHTML = `
        <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 10px;">
          <span style="font-size: 18px;">🔧</span>
          <strong>调试模式已启用</strong>
        </div>
        <div style="margin-bottom: 10px; font-size: 13px; opacity: 0.9;">
          按 F12 或 Ctrl+Shift+I 打开开发者工具
        </div>
          <button id="debug-close-prompt-btn" 
                  style="background: rgba(255,255,255,0.1); border: none; color: white; padding: 6px 12px; border-radius: 6px; cursor: pointer; font-size: 12px; transition: background 0.2s;">
            ✕ 关闭
          </button>
        </div>
      `;

      // 添加事件监听器
      const openConsoleBtn = prompt.querySelector('#debug-open-console-btn');
      const closePromptBtn = prompt.querySelector('#debug-close-prompt-btn');

      if (openConsoleBtn) {
        openConsoleBtn.addEventListener('click', () => {
          window.focus();
          document.dispatchEvent(new KeyboardEvent('keydown', {
            key: 'F12',
            code: 'F12',
            keyCode: 123,
            which: 123,
            bubbles: true,
            cancelable: true
          }));
        });
      }

      if (closePromptBtn) {
        closePromptBtn.addEventListener('click', () => {
          prompt.remove();
        });
      }

      // 添加动画样式
      const style = document.createElement('style');
      style.textContent = `
        @keyframes slideInRight {
          from { transform: translateX(100%); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
        #debug-console-prompt button:hover {
          background: rgba(255,255,255,0.3) !important;
        }
      `;
      document.head.appendChild(style);

      document.body.appendChild(prompt);

      // 5秒后自动隐藏
      setTimeout(() => {
        if (prompt.parentNode) {
          prompt.style.animation = 'slideInRight 0.5s ease-out reverse';
          setTimeout(() => prompt.remove(), 500);
        }
      }, 5000);

    } catch (error) {
      console.warn('创建开发者工具提示失败:', error);
    }
  }

  private showHelp(): void {
    console.log('🔧 调试控制台帮助信息:');
    console.log('  debug.help() - 显示此帮助信息');
    console.log('  debug.config() - 显示当前配置');
    console.log('  debug.reset() - 重置为默认配置');
    console.log('  debug.disable() - 禁用调试模式');
    console.log('  debug.status() - 显示当前状态');
    console.log('  debug.api() - 显示API接口信息');
    console.log('  debug.sync() - 同步后端配置');
    console.log('  debug.forceSync() - 强制同步后端配置');
    console.log('  debug.buffer() - 显示按键缓冲区状态');
    console.log('  debug.resetBuffer() - 重置按键缓冲区');
    console.log('  debug.reactivate() - 重新激活调试控制台');
  }

  private showApiInfo(): void {
    console.log('🌐 调试控制台API接口信息:');
    console.log('  POST /api/debug-console/verify - 验证调试控制台访问');
    console.log('  GET  /api/debug-console/configs - 获取配置列表（管理员）');
    console.log('  PUT  /api/debug-console/configs/:group - 更新配置（管理员）');
    console.log('  DELETE /api/debug-console/configs/:group - 删除配置（管理员）');
    console.log('  GET  /api/debug-console/logs - 获取访问日志（管理员）');
    console.log('  POST /api/debug-console/init - 初始化默认配置（管理员）');
  }

  private showConfig(): void {
    console.log('⚙️ 调试控制台配置:', this.config);
  }

  private showStatus(): void {
    const bufferStatus = this.getKeyBufferStatus();
    console.log('📊 调试控制台状态:', {
      enabled: this.config.enabled,
      isDebugMode: this.isDebugMode,
      attempts: this.attempts,
      maxAttempts: this.config.maxAttempts,
      isLocked: this.isLocked(),
      lockoutUntil: this.lockoutUntil ? new Date(this.lockoutUntil).toLocaleString() : '未锁定',
      keyBuffer: bufferStatus.buffer,
      keySequence: bufferStatus.sequence,
      bufferProgress: `${bufferStatus.progress}%`
    });
  }

  private resetConfig(): void {
    this.config = { ...DEFAULT_DEBUG_CONFIG };
    this.saveConfig();
    console.log('🔄 配置已重置为默认值');
  }

  private disableDebugMode(): void {
    this.isDebugMode = false;
    this.saveDebugMode();
    delete (window as any).debug;
    
    // 移除开发者工具提示
    const prompt = document.getElementById('debug-console-prompt');
    if (prompt) {
      prompt.remove();
    }

    // 禁用选择功能和右键菜单
    this.toggleSelection(false);
    
    // 立即更新权限状态
    if ((window as any).updateDebugPermissions) {
      (window as any).updateDebugPermissions();
    }
    
    // 重置按键缓冲区，确保可以重新激活
    this.keyBuffer = '';
    
    console.log('🚫 调试模式已禁用');
    console.log('💡 如需重新激活，请重新输入按键序列');
  }

  // 重新激活调试控制台
  public reactivate(): void {
    // 检查用户是否为管理员，非管理员用户不进行重新激活
    if (!this.isUserAdmin()) {
      console.log('[调试控制台] 用户非管理员，跳过重新激活');
      return;
    }
    
    if (this.canReactivate()) {
      this.keyBuffer = '';
      console.log('🔄 调试控制台已重置，可以重新输入按键序列激活');
    } else {
      console.warn('⚠️ 调试控制台当前无法重新激活（已禁用或已锁定）');
    }
  }

  public isDebugModeEnabled(): boolean {
    return this.isDebugMode;
  }

  public getConfig(): DebugConsoleConfig {
    return { ...this.config };
  }

  public updateConfig(newConfig: Partial<DebugConsoleConfig>): void {
    this.config = { ...this.config, ...newConfig, updatedAt: new Date() };
    this.saveConfig();
    console.log('✅ 配置已更新');
  }

  // 动态切换选择功能
  public toggleSelection(enable: boolean): void {
    try {
      if (enable) {
        // 启用选择功能
        document.body.style.userSelect = 'auto';
        document.body.style.setProperty('-webkit-user-select', 'auto');
        document.body.style.setProperty('-moz-user-select', 'auto');
        document.body.style.setProperty('-ms-user-select', 'auto');
        document.body.style.setProperty('-webkit-touch-callout', 'auto');
        document.body.style.setProperty('-khtml-user-select', 'auto');
        console.log('✅ 文本选择功能已启用');
      } else {
        // 禁用选择功能
        disableSelection();
        console.log('🚫 文本选择功能已禁用');
      }
    } catch (error) {
      console.warn('切换选择功能失败:', error);
    }
  }

  // 重置按键缓冲区
  public resetKeyBuffer(): void {
    this.keyBuffer = '';
    console.log('🔄 按键缓冲区已重置');
  }

  // 获取当前按键缓冲区状态
  public getKeyBufferStatus(): { buffer: string; sequence: string; progress: number } {
    return {
      buffer: this.keyBuffer,
      sequence: this.config.keySequence,
      progress: Math.round((this.keyBuffer.length / this.config.keySequence.length) * 100)
    };
  }

  // 显示按键缓冲区状态
  private showBufferStatus(): void {
    const status = this.getKeyBufferStatus();
    console.log('📊 按键缓冲区状态:');
    console.log(`   当前缓冲区: "${status.buffer}"`);
    console.log(`   目标序列: "${status.sequence}"`);
    console.log(`   进度: ${status.progress}%`);
    console.log(`   长度: ${status.buffer.length}/${status.sequence.length}`);
  }
}

// 初始化调试控制台管理器
const debugConsoleManager = DebugConsoleManager.getInstance();

// 统一危险关键字 - 扩展更多关键词
const DANGEROUS_KEYWORDS = [
  'supercopy', 'fatkun', 'downloader',
  'copyy', 'copycat', 'copyhelper', 'copyall', 'copytext', 'copycontent', 'copyweb',
  'supercopy', 'supercopyy', 'supercopycat', 'supercopyhelper',
  'fatkun', 'fatkundownloader', 'fatkunbatch', 'fatkunimage',
  'imagecapture', 'screenshot', 'screencapture', 'webcapture',
  'webscraper', 'datascraper', 'contentscraper', 'textscraper', 'ocrtool', 'ocrreader', 'textrecognizer',
  'batchdownload', 'bulkdownload', 'massdownload', 'clipboardmanager', 'clipboardhelper', 'textselection', 'contentselection',
  // 油猴相关关键词
  'tampermonkey', 'greasemonkey', 'violentmonkey', 'userscript',
  'userscripts', 'scriptmonkey', 'grease',
  'violent', 'userjs', 'user.js', 'gm_', 'GM_', 'unsafeWindow',
  'grant', 'namespace'
];

// CSS类名白名单 - 豁免常见的无害CSS类名
const CSS_CLASS_WHITELIST = [
  'object-cover', 'object-contain', 'object-fill', 'object-none', 'object-scale-down',
  'bg-cover', 'bg-contain', 'bg-fill', 'bg-none', 'bg-scale-down',
  'cover', 'contain', 'fill', 'none', 'scale-down',
  'text-center', 'text-left', 'text-right', 'text-justify',
  'flex', 'grid', 'block', 'inline', 'inline-block',
  'relative', 'absolute', 'fixed', 'sticky', 'static',
  'overflow-hidden', 'overflow-auto', 'overflow-scroll', 'overflow-visible',
  'rounded', 'rounded-lg', 'rounded-xl', 'rounded-2xl', 'rounded-3xl',
  'shadow', 'shadow-sm', 'shadow-md', 'shadow-lg', 'shadow-xl', 'shadow-2xl',
  'border', 'border-t', 'border-b', 'border-l', 'border-r',
  'p-1', 'p-2', 'p-3', 'p-4', 'p-5', 'p-6', 'p-8', 'p-10', 'p-12',
  'm-1', 'm-2', 'm-3', 'm-4', 'm-5', 'm-6', 'm-8', 'm-10', 'm-12',
  'w-full', 'h-full', 'w-auto', 'h-auto', 'w-screen', 'h-screen',
  'max-w', 'max-h', 'min-w', 'min-h',
  'opacity', 'transition', 'transform', 'scale', 'rotate', 'translate',
  'hover', 'focus', 'active', 'disabled', 'group', 'peer'
];

// 扩展特定的检测模式
const EXTENSION_PATTERNS = [
  // SuperCopy 相关
  { pattern: /supercopy/i, name: 'SuperCopy' },
  { pattern: /copyy/i, name: 'CopyY' },
  { pattern: /copycat/i, name: 'CopyCat' },

  // Fatkun 相关
  { pattern: /fatkun/i, name: 'Fatkun批量下载' },
  { pattern: /batch.*download/i, name: '批量下载工具' },

  // OCR 相关
  { pattern: /ocr.*tool/i, name: 'OCR识别工具' },
  { pattern: /text.*recognizer/i, name: '文字识别工具' },

  // 截图相关
  { pattern: /screenshot/i, name: '截图工具' },
  { pattern: /screen.*capture/i, name: '屏幕捕获工具' },

  // 抓取相关
  { pattern: /scraper/i, name: '内容抓取工具' },
  { pattern: /data.*extractor/i, name: '数据提取工具' },

  // 油猴相关
  { pattern: /tampermonkey/i, name: 'Tampermonkey' },
  { pattern: /greasemonkey/i, name: 'Greasemonkey' },
  { pattern: /violentmonkey/i, name: 'Violentmonkey' },
  { pattern: /userscript/i, name: '用户脚本' },
  { pattern: /==UserScript==/i, name: '用户脚本头部' },
  { pattern: /@grant/i, name: '油猴权限' },
  { pattern: /@match/i, name: '油猴匹配规则' },
  { pattern: /@include/i, name: '油猴包含规则' },
  { pattern: /@exclude/i, name: '油猴排除规则' },
  { pattern: /@namespace/i, name: '油猴命名空间' },
  { pattern: /unsafeWindow/i, name: '油猴不安全窗口' },
  { pattern: /GM_/i, name: '油猴API' }
];

// 记录命中的危险特征
let detectedReasons: string[] = [];

function hasDangerousExtension() {
  detectedReasons = [];
  let confidence = 0; // 累积分数，弱信号需要叠加

  // 豁免：页面仅包含base64图片或blob图片（如用户头像上传、图片预览）时不触发拦截
  const TRUSTED_HOST_PREFIXES = [
    'http://localhost',
    'https://localhost',
    'https://ipfs.hapxs.com',
    'https://cdn.jsdelivr.net',
    'https://tts-api-docs.hapx.one',
    'https://tts-api-docs.hapxs.com',
    'https://api.hapxs.com',
    'https://tts.hapxs.com'
  ];
  const allImgs = Array.from(document.querySelectorAll('img'));
  if (allImgs.length > 0) {
    const hasExternalImages = allImgs.some(img =>
      !img.src.startsWith('data:image/') &&
      !img.src.startsWith('blob:') &&
      !TRUSTED_HOST_PREFIXES.some(prefix => img.src.startsWith(prefix))
    );

    // 如果所有图片都是本地图片（data:、blob:、localhost），则豁免检测
    if (!hasExternalImages) {
      return false;
    }
  }

  // 页面级豁免：特定上传/管理页面易出现可疑关键词但属于正常功能
  const isImageUploadPage =
    window.location.pathname.includes('image-upload') ||
    document.title.includes('图片上传') ||
    !!document.querySelector('[data-page="image-upload"]');
  if (isImageUploadPage) {
    return false;
  }

  const isFBIWantedPage =
    window.location.pathname.includes('fbi-wanted') ||
    window.location.pathname.includes('admin') ||
    document.title.includes('FBI') ||
    !!document.querySelector('[data-component="FBIWantedManager"]') ||
    !!document.querySelector('[data-component="FBIWantedPublic"]') ||
    document.body.innerHTML.includes('FBIWantedManager') ||
    document.body.innerHTML.includes('FBIWantedPublic');
  if (isFBIWantedPage) {
    return false;
  }

  // 1. 检查所有 script 标签（src 和内容，模糊匹配）
  const scripts = Array.from(document.querySelectorAll('script'));
  for (const s of scripts) {
    const src = (s.src || '').toLowerCase();
    if (TRUSTED_HOST_PREFIXES.some(prefix => src.startsWith(prefix))) {
      // 信任域名的脚本不计分
    } else {
    const content = (s.textContent || '').toLowerCase();
    for (const kw of DANGEROUS_KEYWORDS) {
      // 仅统计明显特征，避免过短或常见词引发误判
      if (kw.length < 6) continue;
      if (src.includes(kw)) {
        detectedReasons.push(`script标签src命中关键词：${kw}`);
        confidence += 1;
      }
      if (content.includes(kw)) {
        detectedReasons.push(`script标签内容命中关键词：${kw}`);
        confidence += 1;
      }
    }
    }
  }

  // 2. 检查已知扩展注入的 DOM 元素（仅检查 id，移除无效的 data-* 匹配，降低误判）
  for (const kw of DANGEROUS_KEYWORDS) {
    if (kw.length < 6) continue;
    if (document.querySelector(`[id*="${kw}"]`)) {
      detectedReasons.push(`DOM节点id命中关键词：${kw}`);
      confidence += 1;
    }

    // 检查 class 属性，但排除白名单中的类名
    const elementsWithClass = document.querySelectorAll(`[class*="${kw}"]`);
    for (const element of elementsWithClass) {
      const classList = (element as HTMLElement).className.split(' ').filter(Boolean);
      const hasDangerousClass = classList.some(cls => cls.includes(kw) && !CSS_CLASS_WHITELIST.includes(cls));
      if (hasDangerousClass) {
        detectedReasons.push(`DOM节点class属性命中关键词：${kw}`);
        confidence += 1;
        break;
      }
    }
  }

  // 3. 检查 body/head 属性
  const allAttrs = [
    ...Array.from(document.body.attributes),
    ...Array.from(document.head ? document.head.attributes : [])
  ].map(a => a.name + '=' + a.value.toLowerCase());
  for (const attr of allAttrs) {
    for (const kw of DANGEROUS_KEYWORDS) {
      if (kw.length < 6) continue;
      if (attr.includes(kw)) {
        detectedReasons.push(`body/head属性命中关键词：${kw}`);
        confidence += 1;
      }
    }
  }

  // 4. 检查全局变量（强信号：立即触发）
  const extensionGlobals = [
    'GM_info', 'GM_getValue', 'GM_setValue', 'GM_addStyle', 'unsafeWindow',
    'tampermonkey', 'greasemonkey', 'violentmonkey'
  ];
  for (const name of extensionGlobals) {
    if ((window as any)[name]) {
      detectedReasons.push(`window全局变量命中：${name}`);
      return true; // 强信号：直接返回
    }
  }

  // 5. 检查扩展注入的样式
  const styles = Array.from(document.querySelectorAll('style, link[rel="stylesheet"]'));
  for (const style of styles) {
    const href = (style as HTMLLinkElement).href ? (style as HTMLLinkElement).href.toLowerCase() : '';
    if (href && TRUSTED_HOST_PREFIXES.some(prefix => href.startsWith(prefix))) {
      continue; // 信任域名的样式直接跳过
    }
    const content = (style.textContent || '').toLowerCase();
    for (const kw of DANGEROUS_KEYWORDS) {
      if (kw.length < 6) continue;
      if (content.includes(kw)) {
        detectedReasons.push(`样式内容命中关键词：${kw}`);
        confidence += 1;
      }
    }
  }

  // 6. 检查扩展的 iframe
  const iframes = Array.from(document.querySelectorAll('iframe'));
  for (const iframe of iframes) {
    const src = (iframe.src || '').toLowerCase();
    if (TRUSTED_HOST_PREFIXES.some(prefix => src.startsWith(prefix))) {
      continue;
    }
    for (const kw of DANGEROUS_KEYWORDS) {
      if (kw.length < 6) continue;
      if (src.includes(kw)) {
        detectedReasons.push(`iframe src命中关键词：${kw}`);
        confidence += 1;
      }
    }
  }

  // 7. 检查扩展的 web accessible resources
  const links = Array.from(document.querySelectorAll('link'));
  for (const link of links) {
    const href = (link.href || '').toLowerCase();
    if (TRUSTED_HOST_PREFIXES.some(prefix => href.startsWith(prefix))) {
      continue;
    }
    for (const kw of DANGEROUS_KEYWORDS) {
      if (kw.length < 6) continue;
      if (href.includes(kw)) {
        detectedReasons.push(`link href命中关键词：${kw}`);
        confidence += 1;
      }
    }
  }

  // 8. 检查扩展的模式匹配（弱信号：累加）
  const pageContent = document.documentElement.outerHTML.toLowerCase();
  for (const pattern of EXTENSION_PATTERNS) {
    if (pattern.pattern.test(pageContent)) {
      detectedReasons.push(`页面源码命中扩展特征：${pattern.name}`);
      confidence += 1;
    }
  }

  // 8.1 页面级组件豁免（通过组件名称/标记进行识别）
  const COMPONENT_EXEMPT_MARKERS = [
    'MarkdownExportPage', 'MarkdownPreview',
    'ResourceStoreList', 'ResourceStoreApp', 'ResourceStoreManager',
    'ShortLinkManager', 'CDKStoreManager',
    'ApiDocs', 'EmailSender',
    'ImageUploadPage', 'ImageUploadSection'
  ];
  const bodyHtml = document.body.innerHTML;
  if (COMPONENT_EXEMPT_MARKERS.some(m => bodyHtml.includes(m))) {
    return false;
  }

  // 9. 检查扩展的特定DOM结构（确认 position:fixed 且 z-index 很高才记分）
  const suspiciousSelectors = [
    '[id*="copy"]',
    '[class*="copy"]',
    '[id*="download"]',
    '[class*="download"]',
    '[id*="ocr"]',
    '[class*="ocr"]',
    '[id*="scraper"]',
    '[class*="scraper"]',
    '[id*="capture"]',
    '[class*="capture"]',
    '[style*="position: fixed"]',
    '[style*="position:fixed"]'
  ];
  for (const selector of suspiciousSelectors) {
    const element = document.querySelector(selector) as HTMLElement | null;
    if (!element) continue;
    const computedStyle = window.getComputedStyle(element);
    const z = parseInt(computedStyle.zIndex || '0', 10);
    if (computedStyle.position === 'fixed' && z > 1000) {
      detectedReasons.push(`可疑元素固定定位且高z-index：${selector}`);
      confidence += 1;
    }
  }

  // 10. 检查扩展的 MutationObserver 监听器（弱信号）
  try {
    const originalObserver = window.MutationObserver;
    const obsStr = originalObserver && originalObserver.prototype && originalObserver.prototype.observe
      ? originalObserver.prototype.observe.toString() : '';
    if (obsStr.includes('copy') || obsStr.includes('download')) {
      detectedReasons.push('MutationObserver监听器可能拦截copy/download');
      confidence += 1;
    }
  } catch (e) {}

  // 11. 检查油猴脚本管理器（强信号：立即触发）
  try {
    if (typeof (window as any).GM_info !== 'undefined') {
      detectedReasons.push('检测到油猴API GM_info');
      return true;
    }
    if (typeof (window as any).tampermonkey !== 'undefined') {
      detectedReasons.push('检测到 Tampermonkey 脚本管理器');
      return true;
    }
    if (typeof (window as any).greasemonkey !== 'undefined') {
      detectedReasons.push('检测到 Greasemonkey 脚本管理器');
      return true;
    }
    if (typeof (window as any).violentmonkey !== 'undefined') {
      detectedReasons.push('检测到 Violentmonkey 脚本管理器');
      return true;
    }
    if (typeof (window as any).unsafeWindow !== 'undefined') {
      detectedReasons.push('检测到油猴特有 unsafeWindow');
      return true;
    }
  } catch (e) {}

  // 12. 检查用户脚本内容（弱信号：累加）
  try {
    const pageText = document.documentElement.outerHTML;
    const userScriptPatterns = [
      /==UserScript==/i,
      /==\/UserScript==/i,
      /@name\s+/i,
      /@version\s+/i,
      /@description\s+/i,
      /@author\s+/i,
      /@match\s+/i,
      /@include\s+/i,
      /@exclude\s+/i,
      /@grant\s+/i,
      /@namespace\s+/i,
      /@require\s+/i,
      /@resource\s+/i,
      /@connect\s+/i,
      /@antifeature\s+/i,
      /@unwrap\s+/i,
      /@noframes\s+/i,
      /@run-at\s+/i,
      /@sandbox\s+/i
    ];
    for (const pattern of userScriptPatterns) {
      if (pattern.test(pageText)) {
        detectedReasons.push(`页面源码命中用户脚本特征：${pattern}`);
        confidence += 1;
      }
    }
    const scriptTags = Array.from(document.querySelectorAll('script'));
    for (const script of scriptTags) {
      const content = script.textContent || '';
      for (const pattern of userScriptPatterns) {
        if (pattern.test(content)) {
          detectedReasons.push(`script标签内容命中用户脚本特征：${pattern}`);
          confidence += 1;
          break;
        }
      }
    }
  } catch (e) {}

  // 13. 检查油猴注入的DOM元素（弱信号：累加）
  try {
    const tampermonkeySelectors = [
      '[id*="tampermonkey"]',
      '[class*="tampermonkey"]',
      '[id*="greasemonkey"]',
      '[class*="greasemonkey"]',
      '[id*="violentmonkey"]',
      '[class*="violentmonkey"]',
      '[id*="userscript"]',
      '[class*="userscript"]',
      '[id*="gm-"]',
      '[class*="gm-"]',
      '[id*="GM_"]',
      '[class*="GM_"]'
    ];
    for (const selector of tampermonkeySelectors) {
      if (document.querySelector(selector)) {
        detectedReasons.push(`DOM节点命中油猴特征选择器：${selector}`);
        confidence += 1;
        break;
      }
    }
    const styleTags = Array.from(document.querySelectorAll('style'));
    for (const style of styleTags) {
      const content = (style.textContent || '').toLowerCase();
      if (content.includes('tampermonkey') ||
        content.includes('greasemonkey') ||
        content.includes('violentmonkey') ||
        content.includes('userscript') ||
        content.includes('gm_')) {
        detectedReasons.push('样式内容命中油猴特征');
        confidence += 1;
        break;
      }
    }
  } catch (e) {}

  // 14. 检查油猴的脚本管理器特征（弱信号：累加；隐藏标记为强信号）
  try {
    const functionNames = Object.getOwnPropertyNames(window);
    const tampermonkeyFunctions = [
      'tampermonkey', 'greasemonkey', 'violentmonkey', 'userscript',
      'scriptmonkey', 'tamper', 'grease', 'violent'
    ];
    for (const funcName of functionNames) {
      for (const tmFunc of tampermonkeyFunctions) {
        if (funcName.toLowerCase().includes(tmFunc)) {
          detectedReasons.push(`window全局函数名命中油猴特征：${funcName}`);
          confidence += 1;
          break;
        }
      }
    }
    if ((window as any).__tampermonkey__) {
      detectedReasons.push('window.__tampermonkey__ 命中');
      return true;
    }
    if ((window as any).__greasemonkey__) {
      detectedReasons.push('window.__greasemonkey__ 命中');
      return true;
    }
    if ((window as any).__violentmonkey__) {
      detectedReasons.push('window.__violentmonkey__ 命中');
      return true;
    }
  } catch (e) {}

  // 若仅有弱信号，则需要至少两个独立命中才拦截
  return confidence >= 2;
}

function blockDangerousExtension() {
  // 响应式动画样式
  const animationStyles = `
      .danger-modal-main {
      scrollbar-width: thin;
      scrollbar-color: #e57373 #fff;
    }
    .danger-modal-main::-webkit-scrollbar {
      width: 8px;
      background: #fff;
      border-radius: 8px;
    }
    .danger-modal-main::-webkit-scrollbar-thumb {
      background: #e57373;
      border-radius: 8px;
      min-height: 40px;
    }
    .danger-modal-main::-webkit-scrollbar-thumb:hover {
      background: #d32f2f;
    }
    @keyframes fadeInScale {
      0% { opacity: 0; transform: scale(0.8) translateY(5vh); }
      100% { opacity: 1; transform: scale(1) translateY(0); }
    }
    @keyframes pulse {
      0%, 100% { transform: scale(1); }
      50% { transform: scale(1.08); }
    }
    @keyframes shake {
      0%, 100% { transform: translateX(0); }
      10%, 30%, 50%, 70%, 90% { transform: translateX(-2vw); }
      20%, 40%, 60%, 80% { transform: translateX(2vw); }
    }
    @keyframes float {
      0%, 100% { transform: translateY(0); }
      50% { transform: translateY(-2vh); }
    }
    @keyframes slideInFromTop {
      0% { opacity: 0; transform: translateY(-5vh); }
      100% { opacity: 1; transform: translateY(0); }
    }
    @keyframes slideInFromBottom {
      0% { opacity: 0; transform: translateY(5vh); }
      100% { opacity: 1; transform: translateY(0); }
    }
    @media (max-width: 600px) {
      .danger-modal-main { padding: 1.2rem !important; }
      .danger-modal-title { font-size: 1.5rem !important; }
      .danger-modal-btn { font-size: 1rem !important; padding: 0.7rem 1.2rem !important; }
      .danger-modal-list { font-size: 0.95rem !important; }
    }
  `;
  const styleSheet = document.createElement('style');
  styleSheet.textContent = animationStyles;
  document.head.appendChild(styleSheet);

  // 让 body 可滚动
  document.body.style.overflow = 'auto';

  // HTML 转义，避免在原因列表中渲染潜在的HTML片段
  const escapeHtml = (str: string) =>
    str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');

  // 展示详细原因
  const reasonHtml = detectedReasons.length
    ? `<div style="margin:1.2rem 0 1.5rem 0;padding:1rem 1.2rem;background:#fff8e1;border-radius:1rem;border:1px solid #ffe082;text-align:left;max-width:100%;overflow-x:auto;">
        <div id="danger-detail-title" data-marker="danger-detail-title" style="color:#d32f2f;font-weight:bold;font-size:1.1rem;margin-bottom:0.5rem;">⚠️ 触发拦截的详细信息：</div>
        <ul style="list-style:disc;padding-left:1.5rem;color:#333;">
          ${detectedReasons.map(r => `<li style="margin:0.25rem 0;">${escapeHtml(r)}</li>`).join('')}
        </ul>
      </div>`
    : '';

  document.body.innerHTML = `
    <div style="position:fixed;z-index:99999;top:0;left:0;width:100vw;height:100vh;background:linear-gradient(135deg, #ff6b6b 0%, #ee5a52 100%);display:flex;flex-direction:column;align-items:center;justify-content:center;font-family:'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;min-height:100vh;min-width:100vw;">
      <!-- 主警告容器 -->
      <div class="danger-modal-main" style="background:rgba(255,255,255,0.97);backdrop-filter:blur(10px);border-radius:2.5rem;padding:2.5rem 2.5rem 2rem 2.5rem;text-align:center;max-width:90vw;width:32rem;box-shadow:0 10px 40px rgba(0,0,0,0.10);border:2px solid rgba(255,255,255,0.2);animation:fadeInScale 0.7s cubic-bezier(.4,2,.6,1) both;overflow-y:auto;max-height:90vh;">
        <div style="width:4.5rem;height:4.5rem;background:linear-gradient(135deg, #d32f2f, #f44336);border-radius:50%;margin:0 auto 1.5rem;display:flex;align-items:center;justify-content:center;animation:pulse 1.8s ease-in-out infinite;box-shadow:0 6px 18px rgba(211, 47, 47, 0.18);">
          <svg style="width:2.2rem;height:2.2rem;color:white;" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z"></path>
          </svg>
        </div>
        <h1 class="danger-modal-title" style="color:#d32f2f;font-size:2.1rem;margin-bottom:1.2rem;font-weight:700;text-shadow:0 2px 4px rgba(0,0,0,0.08);animation:slideInFromTop 0.7s cubic-bezier(.4,2,.6,1) 0.1s both;">
          ⚠️ 检测到非法脚本/扩展
        </h1>
        <div style="animation:slideInFromBottom 0.7s cubic-bezier(.4,2,.6,1) 0.2s both;">
          <p style="color:#333;font-size:1.15rem;margin-bottom:1.2rem;line-height:1.6;font-weight:500;">
            为了确保您的账户安全和系统稳定，我们检测到您的浏览器中运行了可能影响服务正常使用的扩展程序。
          </p>
          ${reasonHtml}
          <div style="background:linear-gradient(135deg, #fff3cd, #ffeaa7);border:1px solid #ffc107;border-radius:0.9rem;padding:1.1rem;margin:1.1rem 0;animation:shake 0.5s cubic-bezier(.4,2,.6,1) 0.5s 1 both;">
            <p style="color:#856404;font-size:1.05rem;margin:0;font-weight:600;">
              🔒 <strong>安全提示：</strong>请关闭以下扩展后刷新页面：
            </p>
            <ul class="danger-modal-list" style="color:#856404;font-size:1rem;margin:0.7rem 0 0 0;text-align:left;padding-left:2rem;">
              <li style="margin:0.4rem 0;">• 超级复制 (SuperCopy/CopyY/CopyCat)</li>
              <li style="margin:0.4rem 0;">• Fatkun批量图片下载</li>
              <li style="margin:0.4rem 0;">• OCR识别扩展</li>
              <li style="margin:0.4rem 0;">• 网页内容抓取工具</li>
              <li style="margin:0.4rem 0;">• 截图/屏幕捕获工具</li>
              <li style="margin:0.4rem 0;">• 批量下载工具</li>
              <li style="margin:0.4rem 0;">• 油猴脚本管理器 (Tampermonkey/Greasemonkey/Violentmonkey)</li>
              <li style="margin:0.4rem 0;">• 用户脚本 (UserScript)</li>
            </ul>
          </div>
          <p style="color:#666;font-size:0.98rem;margin-top:1.5rem;font-style:italic;">
            💡 <strong>操作步骤：</strong>关闭扩展 → 刷新页面 → 重新访问服务
          </p>
        </div>
        <div style="margin-top:1.5rem;animation:slideInFromBottom 0.7s cubic-bezier(.4,2,.6,1) 0.3s both;display:flex;flex-wrap:wrap;gap:1rem;justify-content:center;">
          <button class="danger-modal-btn" onclick="window.location.reload()" style="background:linear-gradient(135deg, #4caf50, #45a049);color:white;border:none;padding:0.9rem 1.7rem;border-radius:0.8rem;font-size:1.08rem;font-weight:600;cursor:pointer;transition:all 0.3s ease;box-shadow:0 4px 15px rgba(76, 175, 80, 0.18);">
            🔄 刷新页面
          </button>
          <button class="danger-modal-btn" onclick="window.history.back()" style="background:linear-gradient(135deg, #2196f3, #1976d2);color:white;border:none;padding:0.9rem 1.7rem;border-radius:0.8rem;font-size:1.08rem;font-weight:600;cursor:pointer;transition:all 0.3s ease;box-shadow:0 4px 15px rgba(33, 150, 243, 0.18);">
            ⬅️ 返回上页
          </button>
        </div>
        <div style="margin-top:1.2rem;padding:0.7rem;background:rgba(255,255,255,0.5);border-radius:0.6rem;animation:slideInFromBottom 0.7s cubic-bezier(.4,2,.6,1) 0.4s both;">
          <p style="color:#666;font-size:0.92rem;margin:0;">
            🛡️ 此安全措施旨在保护您的账户和系统安全
          </p>
        </div>
      </div>
    </div>
  `;
  // throw new Error('检测到危险扩展，已阻止渲染');
  // 只弹窗警告，不抛出异常，保证页面不中断
  // eslint-disable-next-line no-console
  console.error('检测到危险扩展，已弹窗警告，但未阻断页面渲染');
}

// 检测执行时机和多重保险
function runDangerousExtensionCheck() {
  // 图片预览豁免：如果页面所有 img 都是 blob: 或 data:image/，则不弹窗
  const allImgs = Array.from(document.querySelectorAll('img'));
  if (allImgs.length > 0 && allImgs.every(img => img.src.startsWith('data:image/') || img.src.startsWith('blob:'))) {
    return;
  }
  if (hasDangerousExtension()) {
    blockDangerousExtension();
  }
}

// 注释危险扩展检测相关调用，避免阻断页面渲染
document.addEventListener('DOMContentLoaded', () => {
  runDangerousExtensionCheck();
  setTimeout(runDangerousExtensionCheck, 500);
  setTimeout(runDangerousExtensionCheck, 1500);
  setTimeout(runDangerousExtensionCheck, 3000);

  // MutationObserver 监听整个 document
  const observer = new MutationObserver(runDangerousExtensionCheck);
  observer.observe(document, { childList: true, subtree: true, attributes: true });

  // setInterval 定时检测，防止极端延迟注入
  setInterval(runDangerousExtensionCheck, 20000);
});

// 禁止右键和常见调试快捷键（仅生产环境生效）
if (typeof window !== 'undefined' && process.env.NODE_ENV === 'production') {
  // 右键菜单事件监听器
  const contextMenuHandler = (e: MouseEvent) => {
    // 检查是否处于调试模式
    const isDebugMode = debugConsoleManager.isDebugModeEnabled();
    
    // 在调试模式下允许右键菜单
    if (isDebugMode) {
      return;
    }
    
    e.preventDefault();
  };
  
  // 键盘事件监听器
  const keydownHandler = (e: KeyboardEvent) => {
    // 检查是否处于调试模式
    const isDebugMode = debugConsoleManager.isDebugModeEnabled();
    
    // 在调试模式下允许F12和开发者工具快捷键
    if (isDebugMode) {
      return;
    }
    
    // F12
    if (e.key === 'F12') e.preventDefault();
    // Ctrl+Shift+I/C/U/J
    if ((e.ctrlKey && e.shiftKey && ['I', 'C', 'J'].includes(e.key)) ||
      (e.ctrlKey && e.key === 'U')) {
      e.preventDefault();
    }
  };

  // 添加事件监听器
  window.addEventListener('contextmenu', contextMenuHandler);
  window.addEventListener('keydown', keydownHandler);

  // 初始化禁用选择功能（仅在非调试模式下）
  if (!debugConsoleManager.isDebugModeEnabled()) {
    disableSelection();
  }

  // 监听调试模式状态变化，动态调整权限
  const checkDebugModeAndUpdatePermissions = () => {
    const isDebugMode = debugConsoleManager.isDebugModeEnabled();
    
    if (isDebugMode) {
      // 调试模式启用时，移除事件监听器以允许F12等快捷键
      window.removeEventListener('contextmenu', contextMenuHandler);
      window.removeEventListener('keydown', keydownHandler);
      
      // 启用选择功能
      document.body.style.userSelect = 'auto';
      document.body.style.setProperty('-webkit-user-select', 'auto');
      document.body.style.setProperty('-moz-user-select', 'auto');
      document.body.style.setProperty('-ms-user-select', 'auto');
      document.body.style.setProperty('-webkit-touch-callout', 'auto');
      document.body.style.setProperty('-khtml-user-select', 'auto');
      
      console.log('🔧 调试模式已启用，F12等快捷键已解锁');
    } else {
      // 调试模式禁用时，重新添加事件监听器
      window.addEventListener('contextmenu', contextMenuHandler);
      window.addEventListener('keydown', keydownHandler);
      
      // 禁用选择功能
      disableSelection();
      
      console.log('🚫 调试模式已禁用，F12等快捷键已锁定');
    }
  };

  // 定期检查调试模式状态（每1秒检查一次）
  setInterval(checkDebugModeAndUpdatePermissions, 1000);
  
  // 初始检查
  checkDebugModeAndUpdatePermissions();

  // 为调试控制台管理器添加权限更新回调
  (window as any).updateDebugPermissions = checkDebugModeAndUpdatePermissions;
}

// 调试控制台键盘事件监听器
if (typeof window !== 'undefined') {
  window.addEventListener('keydown', (e) => {
    // 只在非输入框中监听按键序列
    const target = e.target as HTMLElement;
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.contentEditable === 'true') {
      return;
    }

    // 处理调试控制台按键序列
    debugConsoleManager.handleKeyPress(e.key);
  });
}

// 初始化完整性检查
document.addEventListener('DOMContentLoaded', () => {
  // 记录初始状态
  const criticalElements = [
    'app-header',
    'app-footer',
    'tts-form',
    'legal-notice'
  ];

  criticalElements.forEach(id => {
    const element = document.getElementById(id);
    if (element) {
      integrityChecker.setIntegrity(id, element.innerHTML);
    }
  });
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
) 