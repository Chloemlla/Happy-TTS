/**
 * 隐私政策强制执行客户端模块
 * 防止用户绕过隐私政策验证
 */

(function() {
  'use strict';

  // 防止多次执行
  if (typeof window !== 'undefined' && window.__policyEnforcementLoaded) return;
  if (typeof window !== 'undefined') window.__policyEnforcementLoaded = true;

  const STORAGE_KEY = 'hapxtts_policy_consent';
  const POLICY_VERSION = '2.0';
  
  // 获取API基础URL（内联版本）
  function getApiBaseUrl() {
    // 检查是否为开发环境
    if (typeof window === 'undefined') return 'https://api.951100.xyz';
    
    const isDev = window.location.hostname === 'localhost' ||
                  window.location.hostname === '127.0.0.1' ||
                  window.location.port === '6000' ||
                  window.location.port === '3001';
    
    if (isDev) {
      const currentHost = window.location.hostname;
      const currentPort = window.location.port;
      
      // 如果访问的是文档站点端口，后端地址指向API服务器
      if (currentHost === '192.168.10.7' && (currentPort === '6000' || currentPort === '3001')) {
        return 'http://192.168.10.7:3000';
      }
      
      // 如果是本地文档站点，指向本地API服务器
      if ((currentHost === 'localhost' || currentHost === '127.0.0.1') && 
          (currentPort === '6000' || currentPort === '3001')) {
        return 'http://localhost:3000';
      }
      
      return 'http://localhost:3000';
    }
    
    return 'https://api.951100.xyz';
  }
  
  // 检测开发者工具
  let devToolsOpen = false;
  let devToolsWarningShown = false;
  
  function detectDevTools() {
    if (typeof window === 'undefined') return;
    
    const threshold = 160;
    const widthThreshold = window.outerWidth - window.innerWidth > threshold;
    const heightThreshold = window.outerHeight - window.innerHeight > threshold;
    
    if (widthThreshold || heightThreshold) {
      if (!devToolsOpen) {
        devToolsOpen = true;
        if (!devToolsWarningShown) {
          console.warn('检测到开发者工具已打开，请注意遵守隐私政策');
          devToolsWarningShown = true;
        }
      }
    } else {
      devToolsOpen = false;
    }
  }

  // 防止控制台操作
  function protectConsole() {
    const originalLog = console.log;
    const originalWarn = console.warn;
    const originalError = console.error;
    
    // 监控可疑的控制台操作
    console.log = function(...args) {
      const message = args.join(' ');
      if (message.includes(STORAGE_KEY) || message.includes('localStorage')) {
        console.warn('检测到可疑的存储操作尝试');
      }
      return originalLog.apply(console, args);
    };
  }

  // 监控 localStorage 操作
  function monitorStorage() {
    const originalSetItem = localStorage.setItem;
    const originalRemoveItem = localStorage.removeItem;
    const originalClear = localStorage.clear;
    
    localStorage.setItem = function(key, value) {
      if (key === STORAGE_KEY) {
        // 验证设置的值是否合法
        try {
          const data = JSON.parse(value);
          if (!data.checksum || !data.fingerprint || !data.timestamp) {
            console.error('检测到非法的隐私政策同意数据');
            return;
          }
        } catch (e) {
          console.error('检测到格式错误的隐私政策数据');
          return;
        }
      }
      return originalSetItem.call(localStorage, key, value);
    };
    
    localStorage.removeItem = function(key) {
      if (key === STORAGE_KEY) {
        console.warn('隐私政策同意状态被清除');
      }
      return originalRemoveItem.call(localStorage, key);
    };
    
    localStorage.clear = function() {
      console.warn('本地存储被清空，隐私政策同意状态将重置');
      return originalClear.call(localStorage);
    };
  }

  // 防止页面被嵌入到其他网站
  function preventFraming() {
    if (typeof window === 'undefined') return;
    
    if (window.top !== window.self) {
      console.error('检测到页面被嵌入，这可能是安全风险');
      window.top.location = window.self.location;
    }
  }

  // 监控页面可见性变化
  function monitorVisibility() {
    if (typeof window === 'undefined' || typeof document === 'undefined') return;
    
    document.addEventListener('visibilitychange', function() {
      if (document.hidden) {
        // 页面隐藏时检查同意状态
        const consent = localStorage.getItem(STORAGE_KEY);
        if (!consent) {
          console.warn('页面隐藏时检测到缺失的隐私政策同意');
        }
      }
    });
  }

  // 防止右键菜单和某些快捷键
  function preventBypass() {
    if (typeof window === 'undefined' || typeof document === 'undefined') return;
    
    // 禁用右键菜单（在政策模态框显示时）
    document.addEventListener('contextmenu', function(e) {
      const consent = localStorage.getItem(STORAGE_KEY);
      if (!consent) {
        e.preventDefault();
        console.warn('请先同意隐私政策');
      }
    });
    
    // 禁用某些快捷键
    document.addEventListener('keydown', function(e) {
      const consent = localStorage.getItem(STORAGE_KEY);
      if (!consent) {
        // 禁用 F12, Ctrl+Shift+I, Ctrl+U 等
        if (e.key === 'F12' || 
            (e.ctrlKey && e.shiftKey && e.key === 'I') ||
            (e.ctrlKey && e.key === 'u')) {
          e.preventDefault();
          console.warn('请先同意隐私政策后再使用开发者工具');
        }
      }
    });
  }

  // 定期验证同意状态（纯服务器验证）
  function periodicVerification() {
    if (typeof window === 'undefined') return;
    
    let verificationInProgress = false;
    
    setInterval(async function() {
      // 防止并发验证
      if (verificationInProgress) return;
      verificationInProgress = true;
      
      try {
        // 每2分钟进行一次强制服务器验证
        const lastServerCheck = sessionStorage.getItem('last_policy_server_check');
        const now = Date.now();
        const twoMinutesAgo = now - (2 * 60 * 1000);
        
        if (!lastServerCheck || parseInt(lastServerCheck) < twoMinutesAgo) {
          console.info('Performing mandatory periodic server verification...');
          
          try {
            // 获取当前设备指纹（简化版本，避免复杂计算）
            const simpleFingerprint = btoa(navigator.userAgent + screen.width + screen.height).substring(0, 16);
            
            // 调用服务器验证
            const baseUrl = getApiBaseUrl();
            const url = `${baseUrl}/api/policy/check?fingerprint=${encodeURIComponent(simpleFingerprint)}&version=${encodeURIComponent(POLICY_VERSION)}`;
            
            const response = await fetch(url, {
              method: 'GET',
              headers: { 'Content-Type': 'application/json' },
              credentials: 'include',
              signal: AbortSignal.timeout(8000) // 8秒超时
            });
            
            if (response.ok) {
              const result = await response.json();
              if (!result.success || !result.hasValidConsent) {
                console.warn('定期服务器验证失败，需要重新同意隐私政策');
                localStorage.removeItem(STORAGE_KEY);
                sessionStorage.removeItem('last_policy_server_check');
                window.location.reload();
                return;
              }
              
              // 更新最后检查时间
              sessionStorage.setItem('last_policy_server_check', now.toString());
              console.info('定期服务器验证通过');
            } else {
              console.error('定期服务器验证请求失败:', response.status);
              // 服务器错误时清除本地状态，强制重新验证
              if (response.status >= 400 && response.status < 500) {
                localStorage.removeItem(STORAGE_KEY);
                sessionStorage.removeItem('last_policy_server_check');
                window.location.reload();
              }
            }
          } catch (serverError) {
            console.error('定期服务器验证出错:', serverError.message);
            // 网络错误时也清除本地状态，确保安全
            localStorage.removeItem(STORAGE_KEY);
            sessionStorage.removeItem('last_policy_server_check');
            console.warn('⚠️ 服务器验证失败，为确保安全将重新验证');
            window.location.reload();
          }
        }
      } catch (e) {
        console.error('定期验证隐私政策同意状态时出错:', e);
        // 出错时也清除本地状态
        localStorage.removeItem(STORAGE_KEY);
        sessionStorage.removeItem('last_policy_server_check');
      } finally {
        verificationInProgress = false;
      }
    }, 60000); // 每分钟检查一次
  }

  // 页面卸载时的检查
  function onPageUnload() {
    if (typeof window === 'undefined') return;
    
    window.addEventListener('beforeunload', function() {
      const consent = localStorage.getItem(STORAGE_KEY);
      if (!consent) {
        console.warn('页面卸载时未检测到有效的隐私政策同意');
      }
    });
  }

  // 初始化所有保护机制
  function initialize() {
    if (typeof window === 'undefined' || typeof document === 'undefined') return;
    
    try {
      preventFraming();
      monitorStorage();
      protectConsole();
      monitorVisibility();
      preventBypass();
      periodicVerification();
      onPageUnload();
      
      // 定期检测开发者工具
      setInterval(detectDevTools, 1000);
      
      console.log('隐私政策强制执行模块已加载');
    } catch (error) {
      console.error('初始化隐私政策强制执行模块失败:', error);
    }
  }

  // 等待 DOM 加载完成
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', initialize);
    } else {
      initialize();
    }
  }

  // 导出一些调试方法（仅在开发环境）
  if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
    window.__policyEnforcement = {
      checkConsent: function() {
        const consent = localStorage.getItem(STORAGE_KEY);
        console.log('Current consent:', consent ? JSON.parse(consent) : null);
      },
      clearConsent: function() {
        localStorage.removeItem(STORAGE_KEY);
        console.log('Consent cleared');
      }
    };
  }
})();
