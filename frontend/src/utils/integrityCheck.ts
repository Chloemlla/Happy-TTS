import CryptoJS from 'crypto-js';
import { getApiBaseUrl } from '../api/api';

interface IntegrityData {
  content: string;
  hash: string;
  timestamp: number;
  checksum: string;
  signature: string;
}

interface TamperEvent {
  // 基础信息
  elementId?: string;
  timestamp: string;
  url: string;

  // 篡改类型和检测方法
  eventType?: string;
  tamperType?: 'dom' | 'network' | 'proxy' | 'injection';
  detectionMethod?: string;

  // 内容相关
  originalContent?: string;
  tamperContent?: string;
  filePath?: string;
  checksum?: string;

  // 统计信息
  attempts?: number;

  // 额外信息
  additionalInfo?: Record<string, any>;
}

interface NetworkIntegrityData {
  originalResponse: string;
  hash: string;
  timestamp: number;
  url: string;
}

// 扩展XMLHttpRequest类型
declare global {
  interface XMLHttpRequest {
    _integrityUrl?: string;
  }
}

class IntegrityChecker {
  private static instance: IntegrityChecker;
  private integrityMap: Map<string, IntegrityData> = new Map();
  private networkIntegrityMap: Map<string, NetworkIntegrityData> = new Map();
  private readonly SECRET_KEY = import.meta.env.VITE_INTEGRITY_KEY || 'your-integrity-key';
  private readonly NETWORK_SECRET = import.meta.env.VITE_NETWORK_KEY || 'network-integrity-key';
  private tamperAttempts: Map<string, number> = new Map();
  private readonly MAX_ATTEMPTS = 3;
  private isInRecoveryMode = false;
  private recoveryInterval: number | null = null;
  private networkMonitorInterval: number | null = null;
  private originalPageContent: string = '';
  private baselineChecksum: string = '';
  private proxyDetectionEnabled = true;
  private lastNetworkCheck = 0;
  private networkCheckInterval = 1000; // 1秒检查一次网络完整性
  private debugMode = import.meta.env.VITE_DEBUG_MODE === 'true';
  private falsePositiveCount = 0;
  private readonly MAX_FALSE_POSITIVES = 10; // 增加误报容忍度
  private isInitialized = false;
  private initializationDelay = 5000; // 增加到5秒，确保页面完全加载
  private errorCount = 0;
  private readonly MAX_ERRORS = 20; // 增加错误容忍度
  private lastErrorTime = 0;
  private readonly ERROR_COOLDOWN = 10000; // 增加冷却时间到10秒
  // 完整性检查开关 - 降低检测强度
  private enableStrictMode = false; // 默认关闭严格模式
  // 与前端危险扩展检测保持一致的可信域名与页面标记豁免
  private readonly TRUSTED_HOST_PREFIXES: string[] = [
    'http://localhost',
    'https://localhost',
    'https://ipfs.hapxs.com',
    'https://cdn.jsdelivr.net',
    'https://tts-api-docs.hapx.one',
    'https://tts-api-docs.hapxs.com',
    'https://api.951100.xyz',
    'https://tts-new.951100.xyz',
    'https://951100.xyz'
  ];
  private readonly COMPONENT_EXEMPT_MARKERS: string[] = [
    'MarkdownExportPage', 'MarkdownPreview',
    'ResourceStoreList', 'ResourceStoreApp', 'ResourceStoreManager',
    'ShortLinkManager', 'CDKStoreManager',
    'ApiDocs', 'EmailSender',
    'ImageUploadPage', 'ImageUploadSection',
    'FBIWantedManager', 'FBIWantedPublic',
    'FirstVisitVerification'
  ];

  private constructor() {
    // 设置全局错误拦截器
    this.setupGlobalErrorHandler();

    // 延迟初始化，等待页面完全加载
    setTimeout(() => {
      this.initializeIntegrityCheck();
      this.initializeRecoveryMode();
      this.initializeNetworkMonitoring();
      this.initializeProxyDetection();
      this.captureBaselineContent();
      this.isInitialized = true;

      if (this.debugMode) {
        this.safeLog('log', '🔒 完整性检查器已初始化，调试模式已启用');
      }
    }, this.initializationDelay);
  }

  // 检查是否为可信任的URL（用于网络完整性豁免）
  private isTrustedUrl(url?: string): boolean {
    try {
      if (!url) return false;
      const u = new URL(url, window.location.origin);
      const href = u.href;
      const origin = `${u.protocol}//${u.host}`;
      return this.TRUSTED_HOST_PREFIXES.some(prefix =>
        href.startsWith(prefix) || origin.startsWith(prefix)
      );
    } catch {
      return false;
    }
  }

  // 检查是否为豁免的页面（根据路径/标题/组件标记）
  private isExemptPage(): boolean {
    try {
      const href = window.location.href;
      const pathname = window.location.pathname || '';
      const title = (document.title || '').toLowerCase();

      // 扩展路径/关键字豁免列表（更多常见动态页面）
      const exemptPathKeywords = [
        '/upload', '/image', '/images', '/img',
        '/fbi', '/wanted', '/public', '/docs', '/api-docs',
        '/resource', '/resources', '/short', '/shortlink', '/short-links',
        '/cdk', '/cdk-store', '/librechat',
        '/verification', '/verify', '/first-visit', '/captcha', '/turnstile',
        '/admin', '/dashboard', '/chat', '/conversation', '/tts', '/api',
        '/settings', '/config', '/profile', '/user'
      ];
      if (exemptPathKeywords.some(k => pathname.toLowerCase().includes(k))) return true;

      // 标题豁免
      const exemptTitleKeywords = [
        'upload', 'image', 'markdown', 'api', 'docs', 'documentation',
        'fbi', 'wanted', 'shortlink', 'short link', 'cdk', 'store', 'librechat',
        'verification', 'verify', 'first visit', 'captcha', 'turnstile', 'security'
      ];
      if (exemptTitleKeywords.some(k => title.includes(k))) return true;

      // 组件/页面标记豁免：检查常见的标记方式
      for (const marker of this.COMPONENT_EXEMPT_MARKERS) {
        const sel = [
          `[data-component="${marker}"]`,
          `[data-page="${marker}"]`,
          `[data-view="${marker}"]`,
          `#${CSS.escape(marker)}`,
          `[id*="${marker}"]`,
          `[class*="${marker}"]`
        ];
        if (document.querySelector(sel.join(', '))) return true;
      }

      // 特殊处理 LibreChat 页面
      if (document.querySelector('[data-component="LibreChatPage"]') ||
        document.querySelector('[data-page="librechat"]') ||
        pathname.includes('/librechat')) {
        return true;
      }

      // 特殊处理首次访问验证页面
      if (document.querySelector('[data-component="FirstVisitVerification"]') ||
        document.querySelector('[data-page="FirstVisitVerification"]') ||
        document.querySelector('[data-view="FirstVisitVerification"]') ||
        pathname.includes('/verification') ||
        pathname.includes('/verify') ||
        title.includes('verification') ||
        title.includes('verify')) {
        return true;
      }

      // 可信来源的整页资源（如受信任CDN/域名提供的页面片段）
      if (this.TRUSTED_HOST_PREFIXES.some(prefix => href.startsWith(prefix))) return true;

      return false;
    } catch {
      return false;
    }
  }

  public static getInstance(): IntegrityChecker {
    if (!IntegrityChecker.instance) {
      IntegrityChecker.instance = new IntegrityChecker();
    }
    return IntegrityChecker.instance;
  }

  // 启用调试模式
  public enableDebugMode(): void {
    this.debugMode = true;
    this.safeLog('log', '🔍 完整性检查器调试模式已启用');
  }

  // 禁用调试模式
  public disableDebugMode(): void {
    this.debugMode = false;
    this.safeLog('log', '🔍 完整性检查器调试模式已禁用');
  }

  // 获取调试信息
  public getDebugInfo(): any {
    return {
      isInitialized: this.isInitialized,
      isInRecoveryMode: this.isInRecoveryMode,
      proxyDetectionEnabled: this.proxyDetectionEnabled,
      falsePositiveCount: this.falsePositiveCount,
      baselineChecksum: this.baselineChecksum,
      originalContentLength: this.originalPageContent.length,
      currentContentLength: document.documentElement.outerHTML.length,
      integrityMapSize: this.integrityMap.size,
      networkIntegrityMapSize: this.networkIntegrityMap.size
    };
  }

  private captureBaselineContent(): void {
    // 确保页面完全加载后再捕获基准内容
    if (document.readyState !== 'complete') {
      if (this.debugMode) {
        this.safeLog('log', '⏳ 等待页面完全加载...', document.readyState);
      }
      setTimeout(() => this.captureBaselineContent(), 500);
      return;
    }

    // 确保DOM已经渲染完成
    if (!document.body || document.body.children.length === 0) {
      if (this.debugMode) {
        this.safeLog('log', '⏳ 等待DOM渲染完成...');
      }
      setTimeout(() => this.captureBaselineContent(), 500);
      return;
    }

    try {
      // 捕获页面初始状态的基准内容
      this.originalPageContent = document.documentElement.outerHTML;
      this.baselineChecksum = this.calculateChecksum(this.originalPageContent);

      // 验证基准内容是否有效
      if (!this.originalPageContent || this.originalPageContent.length < 100) {
        if (this.debugMode) {
          this.safeLog('warn', '⚠️ 基准内容无效，重新尝试捕获...');
        }
        setTimeout(() => this.captureBaselineContent(), 1000);
        return;
      }

      if (this.debugMode) {
        this.safeLog('log', '📸 基准内容已捕获:', {
          length: this.originalPageContent.length,
          checksum: this.baselineChecksum.substring(0, 16) + '...',
          criticalTexts: this.extractCriticalTexts()
        });
      }

      // 存储关键文本的基准状态
      const criticalTexts = this.extractCriticalTexts();
      criticalTexts.forEach((text, index) => {
        this.setIntegrity(`critical-text-${index}`, text);
      });

      // 设置品牌保护区域的完整性基准
      this.setupBrandProtectionBaseline();
    } catch (error) {
      this.safeLog('error', '❌ 捕获基准内容时出错:', error);
      // 延迟重试
      setTimeout(() => this.captureBaselineContent(), 2000);
    }
  }

  private extractCriticalTexts(): string[] {
    const texts: string[] = [];
    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_TEXT,
      null
    );

    let node: Node | null;
    while ((node = walker.nextNode()) !== null) {
      const text = node.textContent?.trim();
      if (text && this.isCriticalText(text)) {
        texts.push(text);
      }
    }
    return texts;
  }

  private isCriticalText(text: string): boolean {
    const criticalPatterns = [
      /Happy[-]?clo/gi,
      /Happy\s*TTS/gi,
      /Happy(?![-\s]?(clo|tts))/gi,
      /TTS/gi,
      /Text\s*to\s*Speech/gi
    ];
    return criticalPatterns.some(pattern => pattern.test(text));
  }

  private initializeNetworkMonitoring(): void {
    // 监控网络请求和响应
    this.interceptNetworkRequests();

    // 注释掉定期检查网络完整性，避免频繁请求
    // this.networkMonitorInterval = window.setInterval(() => {
    //   this.checkNetworkIntegrity();
    // }, this.networkCheckInterval);
  }

  private interceptNetworkRequests(): void {
    // 拦截fetch请求
    const originalFetch = window.fetch;
    window.fetch = async (...args) => {
      const response = await originalFetch(...args);

      // 克隆响应以便检查
      const clonedResponse = response.clone();
      this.analyzeResponse(clonedResponse, args[0] as string);

      return response;
    };

    // 拦截XMLHttpRequest
    const originalXHROpen = XMLHttpRequest.prototype.open;
    const originalXHRSend = XMLHttpRequest.prototype.send;

    XMLHttpRequest.prototype.open = function (method: string, url: string, async?: boolean, username?: string, password?: string) {
      this._integrityUrl = url;
      return originalXHROpen.call(this, method, url, async ?? true, username, password);
    };

    XMLHttpRequest.prototype.send = function (...args: any[]) {
      const xhr = this;
      const originalOnReadyStateChange = xhr.onreadystatechange;

      xhr.onreadystatechange = function () {
        if (xhr.readyState === 4) {
          integrityChecker.analyzeXHRResponse(xhr);
        }
        if (originalOnReadyStateChange) {
          originalOnReadyStateChange.call(xhr, new Event('readystatechange'));
        }
      };

      return originalXHRSend.call(this, ...args);
    };
  }

  private analyzeResponse(response: Response, url: string): void {
    // 仅在严格模式下才分析响应，大幅减少误报
    if (!this.enableStrictMode) return;
    // 信任域名与页面豁免：直接跳过网络完整性分析，减少误报
    if (this.isTrustedUrl(url) || this.isExemptPage()) return;
    if (response.headers.get('content-type')?.includes('text/html')) {
      response.text().then(text => {
        this.checkResponseIntegrity(text, url);
      }).catch(() => {
        // 静默处理错误，避免误报
      });
    }
  }

  private analyzeXHRResponse(xhr: XMLHttpRequest): void {
    // 仅在严格模式下才分析XHR响应
    if (!this.enableStrictMode) return;
    const contentType = xhr.getResponseHeader('content-type');
    if (contentType?.includes('text/html') && xhr._integrityUrl) {
      if (this.isTrustedUrl(xhr._integrityUrl) || this.isExemptPage()) return;
      try {
        this.checkResponseIntegrity(xhr.responseText, xhr._integrityUrl);
      } catch {
        // 静默处理错误，避免误报
      }
    }
  }

  private checkResponseIntegrity(content: string, url: string): void {
    // 页面或URL豁免：跳过严格对比，避免动态页面误报
    if (this.isTrustedUrl(url) || this.isExemptPage()) return;
    const currentHash = this.calculateNetworkHash(content);
    const storedData = this.networkIntegrityMap.get(url);

    if (storedData) {
      if (currentHash !== storedData.hash) {
        this.handleNetworkTampering(url, storedData.originalResponse, content);
      }
    } else {
      // 首次存储
      this.networkIntegrityMap.set(url, {
        originalResponse: content,
        hash: currentHash,
        timestamp: Date.now(),
        url
      });
    }
  }

  private initializeProxyDetection(): void {
    // 注释掉代理检测功能，避免定时请求
    // this.detectProxyHeaders();
    // this.detectResponseTimeAnomalies();
    // this.detectContentLengthChanges();
  }

  private detectProxyHeaders(): void {
    // 注释掉代理检测请求，避免定时请求
    /*
    // 检查常见的代理头
    const proxyHeaders = [
      'via',
      'x-forwarded-for',
      'x-forwarded-proto',
      'x-real-ip',
      'x-forwarded-host'
    ];

    // 通过发送测试请求来检测代理
    fetch('/api/proxy-test', {
      method: 'HEAD',
      cache: 'no-cache'
    }).then(response => {
      const headers = response.headers;
      const hasProxyHeaders = proxyHeaders.some(header => 
        headers.get(header) !== null
      );
      
      if (hasProxyHeaders) {
        this.safeLog('warn', '检测到代理服务器，增强监控模式已启用');
        this.enableEnhancedMonitoring();
      }
    }).catch(() => {
      // 如果测试失败，假设可能存在代理
      this.enableEnhancedMonitoring();
    });
    */
  }

  private enableEnhancedMonitoring(): void {
    this.proxyDetectionEnabled = true;
    // 增加检查频率
    if (this.networkMonitorInterval) {
      clearInterval(this.networkMonitorInterval);
      this.networkMonitorInterval = window.setInterval(() => {
        this.checkNetworkIntegrity();
      }, 500); // 更频繁的检查
    }
  }

  private detectResponseTimeAnomalies(): void {
    // 注释掉响应时间检测请求，避免定时请求
    /*
    const startTime = performance.now();
    fetch('/api/timing-test', { cache: 'no-cache' })
      .then(() => {
        const responseTime = performance.now() - startTime;
        if (responseTime > 1000) { // 超过1秒可能是代理
          this.enableEnhancedMonitoring();
        }
      })
      .catch(() => {
        // 忽略错误
      });
    */
  }

  private detectContentLengthChanges(): void {
    // 如果基准内容无效，不进行检查
    if (!this.originalPageContent || this.originalPageContent.length === 0) {
      return;
    }

    // 监控页面内容长度变化
    const currentLength = document.documentElement.outerHTML.length;
    const baselineLength = this.originalPageContent.length;

    // 大幅提高阈值：只有当基准长度有效且变化超过5000字节或30%时才检查
    const diff = Math.abs(currentLength - baselineLength);
    const percentage = baselineLength > 0 ? (diff / baselineLength) * 100 : 0;

    if (baselineLength > 1000 && (diff > 5000 || percentage > 30)) {
      this.handleContentLengthAnomaly(currentLength, baselineLength);
    }
  }

  private handleContentLengthAnomaly(current: number, baseline: number): void {
    // 如果基准长度为0，说明基准内容没有正确捕获，忽略这次检查
    if (baseline === 0 || baseline < 1000) {
      if (this.debugMode) {
        this.safeLog('warn', '⚠️ 基准长度无效，重新捕获基准内容');
      }
      this.captureBaselineContent();
      return;
    }

    const diff = Math.abs(current - baseline);
    const percentage = (diff / baseline) * 100;

    // 大幅提高阈值：只有变化超过30%才认为是异常
    if (percentage < 30) {
      if (this.debugMode) {
        this.safeLog('log', '✅ 内容长度变化在正常范围内:', {
          baseline,
          current,
          difference: diff,
          percentage: percentage.toFixed(2) + '%'
        });
      }
      return;
    }

    if (this.debugMode) {
      this.safeLog('warn', `⚠️ 内容长度变化较大: 基准=${baseline}, 当前=${current}, 变化=${percentage.toFixed(2)}%`);
    }

    // 仅在严格模式下才进行检查
    if (this.enableStrictMode) {
      this.checkPageIntegrity();
    }
  }

  private checkNetworkIntegrity(): void {
    const now = Date.now();
    if (now - this.lastNetworkCheck < this.networkCheckInterval) {
      return;
    }
    this.lastNetworkCheck = now;

    // 检查当前页面内容与基准的差异
    const currentContent = document.documentElement.outerHTML;
    const currentChecksum = this.calculateChecksum(currentContent);

    if (currentChecksum !== this.baselineChecksum) {
      this.handlePageContentChange(currentContent);
    }

    // 检查关键文本是否被替换
    this.checkCriticalTextReplacement();
  }

  private handlePageContentChange(currentContent: string): void {
    // 分析变化的内容
    const changes = this.analyzeContentChanges(currentContent);

    if (changes.hasProxyTampering) {
      this.handleProxyTampering(changes);
    }
  }

  private analyzeContentChanges(currentContent: string): {
    hasProxyTampering: boolean;
    replacedTexts: string[];
    addedContent: string[];
    removedContent: string[];
    confidence: number;
  } {
    // 如果在豁免页面，直接返回安全结果
    if (this.isExemptPage()) {
      return {
        hasProxyTampering: false,
        replacedTexts: [],
        addedContent: [],
        removedContent: [],
        confidence: 0
      };
    }

    const result = {
      hasProxyTampering: false,
      replacedTexts: [] as string[],
      addedContent: [] as string[],
      removedContent: [] as string[],
      confidence: 0
    };

    let confidenceScore = 0;

    // 检查是否包含代理替换的特征
    const proxySignatures = [
      /sub_filter/gi,
      /nginx/gi,
      /proxy_pass/gi,
      /<!--\s*nginx\s*-->/, // nginx注释
      /<!--\s*proxy\s*-->/, // 代理注释
    ];

    if (proxySignatures.some(sig => sig.test(currentContent))) {
      result.hasProxyTampering = true;
      confidenceScore += 50;

      if (this.debugMode) {
        this.safeLog('log', '🚨 检测到代理特征:', proxySignatures.filter(sig => sig.test(currentContent)));
      }
    }

    // 检查关键文本是否被替换
    const criticalTexts = ['SynapticArch', 'Happy TTS', 'Happy'];
    const missingTexts: string[] = [];

    criticalTexts.forEach(text => {
      const pattern = new RegExp(text.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&'), 'gi');
      if (!pattern.test(currentContent)) {
        missingTexts.push(text);
        confidenceScore += 20;
      }
    });

    if (missingTexts.length > 0) {
      result.replacedTexts = missingTexts;
      result.hasProxyTampering = true;

      if (this.debugMode) {
        this.safeLog('log', '⚠️ 检测到缺失的关键文本:', missingTexts);
      }
    }

    // 检查内容长度异常
    const lengthDiff = Math.abs(currentContent.length - this.originalPageContent.length);
    const lengthPercentage = this.originalPageContent.length > 0 ? (lengthDiff / this.originalPageContent.length) * 100 : 0;

    // 大幅提高内容长度异常阈值
    if (lengthDiff > 5000 || lengthPercentage > 20) {
      confidenceScore += 10; // 降低权重

      if (this.debugMode) {
        this.safeLog('log', '📏 内容长度异常:', {
          original: this.originalPageContent.length,
          current: currentContent.length,
          difference: lengthDiff,
          percentage: lengthPercentage.toFixed(2) + '%'
        });
      }
    }

    // 检查是否只是正常的页面更新
    const isNormalUpdate = this.checkIfNormalUpdate(currentContent);
    if (isNormalUpdate) {
      confidenceScore -= 50; // 大幅降低置信度

      if (this.debugMode) {
        this.safeLog('log', '✅ 检测到正常页面更新，大幅降低篡改置信度');
      }
    }

    // 检查是否在信任域名
    if (this.isTrustedUrl(window.location.href)) {
      confidenceScore -= 40;
      if (this.debugMode) {
        this.safeLog('log', '✅ 在可信域名，降低篡改置信度');
      }
    }

    result.confidence = Math.max(0, Math.min(100, confidenceScore));

    if (this.debugMode) {
      this.safeLog('log', '🔍 内容变化分析结果:', {
        hasProxyTampering: result.hasProxyTampering,
        confidence: result.confidence,
        replacedTexts: result.replacedTexts,
        lengthDiff
      });
    }

    return result;
  }

  private handleProxyTampering(changes: any): void {
    // 大幅提高置信度阈值：低于60分视为误报
    if (changes.confidence < 60) {
      this.falsePositiveCount++;

      if (this.debugMode) {
        this.safeLog('log', '🤔 可能的误报，置信度较低:', changes.confidence);
      }

      if (this.falsePositiveCount >= this.MAX_FALSE_POSITIVES) {
        if (this.debugMode) {
          this.safeLog('warn', '⚠️ 误报次数过多，调整检测策略');
        }
        this.adjustDetectionStrategy();
        return;
      }
      return;
    }

    // 重置误报计数
    this.falsePositiveCount = 0;

    this.safeLog('error', '🚨 检测到代理篡改行为！', changes);

    if (this.debugMode) {
      this.safeLog('log', '🔍 篡改详情:', {
        confidence: changes.confidence,
        replacedTexts: changes.replacedTexts,
        hasProxyTampering: changes.hasProxyTampering
      });
    }

    // 立即恢复原始内容
    this.performEmergencyRecovery();

    // 记录篡改事件
    this.handleTampering('proxy-tampering', undefined, undefined, 'proxy', 'network-analysis');

    // 显示代理篡改警告
    this.showProxyTamperWarning();
  }

  private adjustDetectionStrategy(): void {
    // 大幅调整检测策略以减少误报
    this.networkCheckInterval = 30000; // 增加到30秒
    this.enableStrictMode = false; // 关闭严格模式

    // 停止网络监控定时器
    if (this.networkMonitorInterval) {
      clearInterval(this.networkMonitorInterval);
      this.networkMonitorInterval = null;
    }

    if (this.debugMode) {
      this.safeLog('log', '⚙️ 已大幅调整检测策略，关闭严格模式，减少误报');
    }
  }

  private performEmergencyRecovery(): void {
    // 紧急恢复模式
    this.isInRecoveryMode = true;

    if (this.debugMode) {
      this.safeLog('log', '🔄 执行紧急恢复...');
    }

    try {
      // 恢复原始页面内容
      document.documentElement.innerHTML = this.originalPageContent;

      // 重新初始化关键元素
      this.reinitializeCriticalElements();

      // 5秒后退出恢复模式
      setTimeout(() => {
        this.isInRecoveryMode = false;
        if (this.debugMode) {
          this.safeLog('log', '✅ 紧急恢复完成，退出恢复模式');
        }
      }, 5000);
    } catch (error) {
      this.safeLog('error', '❌ 紧急恢复失败:', error);
      this.isInRecoveryMode = false;
    }
  }

  private reinitializeCriticalElements(): void {
    // 重新设置关键元素的完整性检查
    const criticalElements = document.querySelectorAll('[data-integrity]');
    criticalElements.forEach(element => {
      const elementId = element.id || 'critical-element';
      this.setIntegrity(elementId, element.innerHTML);
    });
  }

  private showProxyTamperWarning(): void {
    const warning = document.createElement('div');
    warning.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      background: linear-gradient(45deg, #ff0000, #ff6600);
      color: white;
      padding: 15px;
      text-align: center;
      z-index: 10001;
      font-weight: bold;
      box-shadow: 0 2px 10px rgba(0,0,0,0.3);
      animation: networkWarning 2s infinite;
    `;
    warning.innerHTML = `
      <div style="font-size: 1.2em; margin-bottom: 5px;">🚨 网络篡改检测</div>
      <div style="font-size: 0.9em;">检测到通过代理服务器的内容篡改！系统已启动紧急恢复模式。</div>
    `;
    document.body.prepend(warning);

    // 添加动画样式
    const style = document.createElement('style');
    style.textContent = `
      @keyframes networkWarning {
        0%, 100% { background: linear-gradient(45deg, #ff0000, #ff6600); }
        50% { background: linear-gradient(45deg, #ff6600, #ff0000); }
      }
    `;
    document.head.appendChild(style);

    // 5秒后移除警告
    setTimeout(() => {
      warning.remove();
    }, 5000);
  }

  private checkCriticalTextReplacement(): void {
    // 如果正在恢复模式，跳过检查
    if (this.isInRecoveryMode) {
      return;
    }

    // 检查是否在安全的时间窗口内
    const now = Date.now();
    if (now - this.lastNetworkCheck < 2000) { // 2秒内不重复检查
      return;
    }

    try {
      const walker = document.createTreeWalker(
        document.body,
        NodeFilter.SHOW_TEXT,
        null
      );

      let node: Node | null;
      while ((node = walker.nextNode()) !== null) {
        const text = node.textContent;
        if (text) {
          this.checkProtectedTexts(text, node);
        }
      }
    } catch (error) {
      this.safeLog('error', '❌ 检查关键文本替换时出错:', error);
    }
  }

  private calculateChecksum(content: string): string {
    return CryptoJS.SHA256(content).toString();
  }

  private calculateNetworkHash(content: string): string {
    return CryptoJS.HmacSHA256(content, this.NETWORK_SECRET).toString();
  }

  private calculateSignature(content: string): string {
    const timestamp = Date.now().toString();
    const data = content + timestamp + this.SECRET_KEY;
    return CryptoJS.SHA512(data).toString();
  }

  private initializeRecoveryMode(): void {
    // 每500ms检查一次是否需要恢复
    this.recoveryInterval = window.setInterval(() => {
      if (this.isInRecoveryMode) {
        this.performRecovery();
      }
    }, 500);
  }

  private initializeIntegrityCheck(): void {
    const observer = new MutationObserver((mutations) => {
      if (!this.isInRecoveryMode) {
        mutations.forEach(mutation => {
          // 检查是否是安全的DOM变化
          if (this.isSafeDOMChange(mutation)) {
            if (this.debugMode) {
              this.safeLog('log', '✅ 检测到安全的DOM变化，跳过检查');
            }
            return;
          }

          // 如果在豁免页面，跳过检查
          if (this.isExemptPage()) {
            if (this.debugMode) {
              this.safeLog('log', '✅ 在豁免页面，跳过完整性检查');
            }
            return;
          }

          if (mutation.type === 'characterData' || mutation.type === 'childList') {
            this.handleMutation(mutation);
          }
        });
      }
    });

    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      characterData: true
    });

    // 大幅降低定期检查频率
    setInterval(() => {
      // 只在严格模式下才进行定期检查
      if (this.enableStrictMode && !this.isExemptPage()) {
        this.checkPageIntegrity();
      }
    }, 600000); // 改为10分钟检查一次
  }

  private handleMutation(mutation: MutationRecord): void {
    // 如果在豁免页面，跳过检查
    if (this.isExemptPage()) {
      return;
    }

    if (mutation.type === 'characterData' && mutation.target.textContent) {
      const text = mutation.target.textContent;
      this.checkProtectedTexts(text, mutation.target as Node);
    } else if (mutation.type === 'childList') {
      mutation.addedNodes.forEach(node => {
        if (node.nodeType === Node.TEXT_NODE && node.textContent) {
          this.checkProtectedTexts(node.textContent, node);
        }
      });
    }
  }

  private checkProtectedTexts(text: string, node: Node): void {
    // 检查是否是安全的文本变化
    if (this.isSafeTextChange(text, node)) {
      return;
    }

    // 如果在 LibreChat 页面，放宽检查
    if (this.isExemptPage()) {
      return;
    }

    const protectedPatterns = [
      { original: 'SynapticArch', pattern: /Happy[-]?clo/gi },
      { original: 'Happy TTS', pattern: /Happy\s*TTS/gi },
      { original: 'Happy', pattern: /Happy(?![-\s]?(clo|tts))/gi }
    ];

    protectedPatterns.forEach(({ original, pattern }) => {
      if (text.match(pattern) && text !== original) {
        this.handleTextTampering(node, text, original);
      }
    });
  }

  // 检查是否是安全的文本变化
  private isSafeTextChange(text: string, node: Node): boolean {
    // 检查父元素是否是安全元素
    let parent = node.parentElement;
    while (parent) {
      // 安全地获取 className 和 id，确保它们是字符串类型
      const className = typeof parent.className === 'string' ? parent.className : '';
      const id = typeof parent.id === 'string' ? parent.id : '';

      // 安全元素标识
      const safeIdentifiers = [
        'loading', 'spinner', 'progress', 'toast', 'notification',
        'modal', 'popup', 'tooltip', 'dropdown', 'menu'
      ];

      if (safeIdentifiers.some(safeId =>
        className.toLowerCase().includes(safeId) ||
        id.toLowerCase().includes(safeId)
      )) {
        return true;
      }

      // 检查是否是聊天相关的元素
      const chatIdentifiers = [
        'chat', 'message', 'conversation', 'dialog', 'librechat',
        'user', 'assistant', 'bot', 'ai', 'streaming'
      ];

      if (chatIdentifiers.some(chatId =>
        className.toLowerCase().includes(chatId) ||
        id.toLowerCase().includes(chatId)
      )) {
        return true;
      }

      parent = parent.parentElement;
    }

    // 检查文本内容是否是安全的
    const safeTextPatterns = [
      /loading/gi,
      /spinner/gi,
      /progress/gi,
      /toast/gi,
      /notification/gi,
      /modal/gi,
      /popup/gi,
      /tooltip/gi,
      /dropdown/gi,
      /menu/gi
    ];

    // 检查是否是聊天相关的文本内容
    const chatTextPatterns = [
      /用户/gi,
      /助手/gi,
      /assistant/gi,
      /user/gi,
      /生成中/gi,
      /发送中/gi,
      /loading/gi,
      /streaming/gi,
      /聊天/gi,
      /对话/gi,
      /消息/gi
    ];

    // 检查是否是验证相关的文本内容
    const verificationTextPatterns = [
      /验证/gi,
      /verification/gi,
      /verify/gi,
      /captcha/gi,
      /turnstile/gi,
      /人机验证/gi,
      /安全验证/gi,
      /首次访问/gi,
      /first visit/gi,
      /欢迎访问/gi,
      /welcome/gi,
      /继续访问/gi,
      /验证通过/gi,
      /验证成功/gi,
      /验证失败/gi,
      /重试/gi,
      /retry/gi
    ];

    return safeTextPatterns.some(pattern => pattern.test(text)) ||
      chatTextPatterns.some(pattern => pattern.test(text)) ||
      verificationTextPatterns.some(pattern => pattern.test(text));
  }

  private handleTextTampering(node: Node, tamperText: string, originalText: string): void {
    const elementId = this.getElementId(node);
    const attempts = this.tamperAttempts.get(elementId) || 0;

    if (attempts >= this.MAX_ATTEMPTS) {
      this.activateAntiTamperMeasures(elementId);
    } else {
      this.tamperAttempts.set(elementId, attempts + 1);
      if (node.textContent) {
        node.textContent = originalText;
      }
      this.handleTampering(elementId, originalText, tamperText);
    }
  }

  private getElementId(node: Node): string {
    let element = node.parentElement;
    while (element) {
      if (element.id) return element.id;
      element = element.parentElement;
    }
    return 'unknown-element';
  }

  private activateAntiTamperMeasures(elementId: string): void {
    this.isInRecoveryMode = true;

    // 创建遮罩层
    const overlay = document.createElement('div');
    overlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(255, 0, 0, 0.1);
      z-index: 9999;
      pointer-events: none;
    `;
    document.body.appendChild(overlay);

    // 显示严重警告
    this.showSeriousTamperWarning();

    // 开始持续恢复模式
    this.performRecovery();
  }

  private performRecovery(): void {
    // 恢复所有被保护的文本
    const protectedTexts = ['SynapticArch', 'Happy TTS', 'Happy'];
    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_TEXT,
      null
    );

    let node: Node | null;
    while ((node = walker.nextNode()) !== null) {
      const textContent = node.textContent;
      if (textContent) {
        let newContent = textContent;
        protectedTexts.forEach(text => {
          const pattern = new RegExp(text.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&'), 'gi');
          if (newContent !== text && pattern.test(newContent)) {
            newContent = text;
          }
        });
        if (newContent !== textContent) {
          node.textContent = newContent;
        }
      }
    }
  }

  private showSeriousTamperWarning(): void {
    const warning = document.createElement('div');
    warning.style.cssText = `
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      background: #ff0000;
      color: white;
      padding: 20px;
      border-radius: 10px;
      text-align: center;
      z-index: 10000;
      box-shadow: 0 0 20px rgba(0,0,0,0.5);
      animation: pulse 2s infinite;
    `;
    warning.innerHTML = `
      <h2 style="margin:0 0 10px">严重警告</h2>
      <p style="margin:0">检测到持续篡改行为！<br>系统已启动防御机制。</p>
    `;
    document.body.appendChild(warning);

    // 添加动画样式
    const style = document.createElement('style');
    style.textContent = `
      @keyframes pulse {
        0% { transform: translate(-50%, -50%) scale(1); }
        50% { transform: translate(-50%, -50%) scale(1.1); }
        100% { transform: translate(-50%, -50%) scale(1); }
      }
    `;
    document.head.appendChild(style);
  }

  public setIntegrity(elementId: string, content: string): void {
    const hash = this.calculateSignature(content);
    this.integrityMap.set(elementId, {
      content,
      hash,
      timestamp: Date.now(),
      checksum: this.calculateChecksum(content),
      signature: hash
    });
  }

  public verifyIntegrity(elementId: string, content: string): boolean {
    const data = this.integrityMap.get(elementId);
    if (!data) return false;

    const currentSignature = this.calculateSignature(content);
    return currentSignature === data.signature;
  }

  private checkPageIntegrity(): void {
    // 检查关键元素（包括新增的品牌保护区域）
    const criticalElements = [
      'app-header',
      'app-footer',
      'tts-form',
      'legal-notice',
      // 新增：品牌标识关键区域
      'app-header-container',
      'app-header-content',
      'app-brand-logo',
      'app-brand-icon',
      'app-brand-text'
    ];

    criticalElements.forEach(id => {
      const element = document.getElementById(id);
      if (element) {
        const currentContent = element.innerHTML;
        if (!this.verifyIntegrity(id, currentContent)) {
          console.error(`检测到页面元素 ${id} 被篡改！`);

          // 对品牌标识区域进行特殊处理
          if (this.isBrandProtectedElement(id)) {
            this.handleBrandTampering(id, element);
          } else {
            this.handleTampering(id);
          }
        }
      }
    });

    // 检查特定文本
    this.checkTextIntegrity();

    // 新增：专门检查品牌保护区域
    this.checkBrandProtectionIntegrity();
  }

  private checkTextIntegrity(): void {
    const protectedTexts = ['SynapticArch', 'Happy TTS', 'Happy'];
    const bodyText = document.body.innerText;

    protectedTexts.forEach(text => {
      const regex = new RegExp(text.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&'), 'g');
      if (!regex.test(bodyText)) {
        console.error(`检测到受保护文本 "${text}" 被删除或修改！`);
        this.handleTampering('protected-text');
      }
    });
  }

  private handleTampering(elementId: string, originalContent?: string, tamperContent?: string, tamperType?: 'dom' | 'network' | 'proxy' | 'injection', detectionMethod?: string): void {
    // 确定事件类型
    let eventType = 'unknown';
    if (tamperType === 'dom') {
      eventType = 'dom_modification';
    } else if (tamperType === 'network') {
      eventType = 'network_tampering';
    } else if (tamperType === 'proxy') {
      eventType = 'proxy_tampering';
    } else if (tamperType === 'injection') {
      eventType = 'script_injection';
    }

    // 计算内容校验和
    let checksum: string | undefined;
    if (originalContent) {
      checksum = this.calculateChecksum(originalContent);
    }

    // 确定文件路径（如果是DOM元素）
    let filePath: string | undefined;
    if (elementId && elementId !== 'unknown-element') {
      filePath = window.location.pathname;
    }

    const tamperEvent: TamperEvent = {
      elementId,
      timestamp: new Date().toISOString(),
      url: window.location.href,
      eventType,
      tamperType,
      detectionMethod,
      originalContent,
      tamperContent,
      filePath,
      checksum,
      attempts: this.tamperAttempts.get(elementId),
      additionalInfo: {
        userAgent: navigator.userAgent,
        screenResolution: `${screen.width}x${screen.height}`,
        timestamp: Date.now(),
        pageTitle: document.title,
        referrer: document.referrer
      }
    };

    this.reportTampering(tamperEvent);
    this.showTamperWarning(tamperEvent);
  }

  private reportTampering(event: TamperEvent): void {
    // 发送篡改事件到服务器
    const apiUrl = `${getApiBaseUrl()}/api/tamper/report-tampering`;

    fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(event)
    }).then(response => {
      if (!response.ok) {
        if (this.debugMode) {
          this.safeLog('warn', `⚠️ 篡改报告发送失败: ${response.status} ${response.statusText}`);
        }
      } else if (this.debugMode) {
        this.safeLog('log', '✅ 篡改报告已成功发送');
      }
    }).catch(error => {
      if (this.debugMode) {
        this.safeLog('error', '❌ 篡改报告发送错误:', error);
      }
    });
  }

  private showTamperWarning(event: TamperEvent): void {
    const warning = document.createElement('div');
    let countdown = 10;
    warning.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      background: #ff4444;
      color: white;
      padding: 10px;
      text-align: center;
      z-index: 9999;
      font-weight: bold;
      animation: slideDown 0.5s ease-out;
    `;
    warning.innerHTML = `
      <div>警告：检测到页面内容被篡改！</div>
      <div style="font-size: 0.8em; margin-top: 5px;">
        ${event.eventType ? `类型: ${event.eventType}` : ''} ${event.elementId ? `| 元素: ${event.elementId}` : ''} | 
        时间: ${new Date(event.timestamp).toLocaleTimeString()} | 
        尝试次数: ${event.attempts || 0}/${this.MAX_ATTEMPTS}
      </div>
      <div id="tamper-countdown" style="margin-top: 5px; font-size: 1em;">
        页面将在 <span id="tamper-seconds">${countdown}</span> 秒后自动关闭并显示水印
      </div>
    `;
    document.body.prepend(warning);

    // 倒计时逻辑
    const interval = setInterval(() => {
      countdown--;
      const secSpan = warning.querySelector('#tamper-seconds');
      if (secSpan) secSpan.textContent = countdown.toString();
      if (countdown <= 0) {
        clearInterval(interval);
        warning.remove();
        // 触发全屏水印
        window.dispatchEvent(new Event('show-happy-tts-watermark'));
        // 关闭页面
        window.close();
      }
    }, 1000);
  }

  private handleNetworkTampering(url: string, originalResponse: string, tamperedResponse: string): void {
    console.error(`检测到网络篡改行为！原响应: ${originalResponse}, 篡改后响应: ${tamperedResponse}`);

    // 立即恢复原始内容
    this.performEmergencyRecovery();

    // 记录篡改事件
    this.handleTampering('network-tampering', originalResponse, tamperedResponse, 'network', 'network-analysis');

    // 显示网络篡改警告
    this.showNetworkTamperWarning();
  }

  private showNetworkTamperWarning(): void {
    const warning = document.createElement('div');
    warning.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      background: linear-gradient(45deg, #ff0000, #ff6600);
      color: white;
      padding: 15px;
      text-align: center;
      z-index: 10001;
      font-weight: bold;
      box-shadow: 0 2px 10px rgba(0,0,0,0.3);
      animation: networkWarning 2s infinite;
    `;
    warning.innerHTML = `
      <div style="font-size: 1.2em; margin-bottom: 5px;">🚨 网络篡改检测</div>
      <div style="font-size: 0.9em;">检测到通过代理服务器的内容篡改！系统已启动紧急恢复模式。</div>
    `;
    document.body.prepend(warning);

    // 添加动画样式
    const style = document.createElement('style');
    style.textContent = `
      @keyframes networkWarning {
        0%, 100% { background: linear-gradient(45deg, #ff0000, #ff6600); }
        50% { background: linear-gradient(45deg, #ff6600, #ff0000); }
      }
    `;
    document.head.appendChild(style);

    // 5秒后移除警告
    setTimeout(() => {
      warning.remove();
    }, 5000);
  }

  // 重新初始化完整性检查器
  public reinitialize(): void {
    if (this.debugMode) {
      this.safeLog('log', '🔄 重新初始化完整性检查器...');
    }

    // 清理现有状态
    this.isInRecoveryMode = false;
    this.falsePositiveCount = 0;
    this.originalPageContent = '';
    this.baselineChecksum = '';
    this.integrityMap.clear();
    this.networkIntegrityMap.clear();
    this.resetErrorCount(); // 重置错误计数

    // 重新捕获基准内容
    this.captureBaselineContent();

    if (this.debugMode) {
      this.safeLog('log', '✅ 完整性检查器重新初始化完成');
    }
  }

  // 获取错误状态
  public getErrorStatus(): any {
    return {
      errorCount: this.errorCount,
      maxErrors: this.MAX_ERRORS,
      lastErrorTime: this.lastErrorTime,
      errorCooldown: this.ERROR_COOLDOWN,
      isErrorLimited: this.errorCount >= this.MAX_ERRORS
    };
  }

  // 手动重置错误计数
  public resetErrors(): void {
    this.resetErrorCount();
    if (this.debugMode) {
      this.safeLog('log', '🔄 错误计数已重置');
    }
  }

  // 手动捕获基准内容
  public captureBaseline(): void {
    if (this.debugMode) {
      console.log('📸 手动捕获基准内容...');
    }
    this.captureBaselineContent();
  }

  // 暂停完整性检查
  public pause(): void {
    this.isInRecoveryMode = true;
    if (this.debugMode) {
      console.log('⏸️ 完整性检查已暂停');
    }
  }

  // 恢复完整性检查
  public resume(): void {
    this.isInRecoveryMode = false;
    if (this.debugMode) {
      console.log('▶️ 完整性检查已恢复');
    }
  }

  // 安全的错误日志方法
  private safeLog(level: 'log' | 'warn' | 'error', message: string, data?: any): void {
    const now = Date.now();

    // 检查错误数量限制
    if (level === 'error') {
      if (this.errorCount >= this.MAX_ERRORS) {
        // 如果超过最大错误数量，只在冷却期后显示一次
        if (now - this.lastErrorTime > this.ERROR_COOLDOWN) {
          console.warn('⚠️ 错误数量过多，已暂停错误输出。请检查页面状态。');
          this.lastErrorTime = now;
        }
        return;
      }
      this.errorCount++;
      this.lastErrorTime = now;
    }

    // 使用try-catch包装日志输出，防止日志本身出错
    try {
      if (data) {
        console[level](message, data);
      } else {
        console[level](message);
      }
    } catch (e) {
      // 如果日志输出失败，静默处理
    }
  }

  // 重置错误计数
  private resetErrorCount(): void {
    this.errorCount = 0;
  }

  // 设置全局错误拦截器
  private setupGlobalErrorHandler(): void {
    // 拦截未捕获的错误
    window.addEventListener('error', (event) => {
      // 检查是否是完整性检查器相关的错误
      if (event.error && event.error.message &&
        (event.error.message.includes('integrityCheck') ||
          event.error.message.includes('blockDangerousExtension'))) {
        event.preventDefault();
        event.stopPropagation();

        if (this.debugMode) {
          this.safeLog('warn', '🛡️ 拦截到完整性检查相关错误:', event.error.message);
        }
        return false;
      }
    }, true);

    // 拦截未处理的Promise拒绝
    window.addEventListener('unhandledrejection', (event) => {
      if (event.reason && typeof event.reason === 'string' &&
        event.reason.includes('integrityCheck')) {
        event.preventDefault();

        if (this.debugMode) {
          this.safeLog('warn', '🛡️ 拦截到完整性检查Promise错误:', event.reason);
        }
        return false;
      }
    });
  }

  // 检查是否是安全的DOM变化
  private isSafeDOMChange(mutation: MutationRecord): boolean {
    // 白名单：安全的DOM变化类型
    const safeSelectors = [
      '[data-loading]',
      '[data-spinner]',
      '[data-progress]',
      '.loading',
      '.spinner',
      '.progress',
      '.toast',
      '.notification',
      '.modal',
      '.popup',
      '[class*="loading"]',
      '[class*="spinner"]',
      '[class*="progress"]'
    ];

    // 检查是否是白名单元素的变化
    if (mutation.type === 'childList') {
      for (const node of mutation.addedNodes) {
        if (node.nodeType === Node.ELEMENT_NODE) {
          const element = node as Element;
          if (safeSelectors.some(selector => element.matches(selector))) {
            return true;
          }
        }
      }
    }

    // 检查是否是动态内容加载
    if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
      const addedContent = Array.from(mutation.addedNodes)
        .map(node => node.textContent || '')
        .join('');

      // 检查是否包含动态内容标识
      const dynamicPatterns = [
        /loading/gi,
        /spinner/gi,
        /progress/gi,
        /toast/gi,
        /notification/gi,
        /modal/gi,
        /popup/gi
      ];

      if (dynamicPatterns.some(pattern => pattern.test(addedContent))) {
        return true;
      }
    }

    return false;
  }

  // 启用严格模式（更激进的检测）
  public enableStrictDetection(): void {
    this.enableStrictMode = true;
    if (this.debugMode) {
      this.safeLog('log', '🔒 已启用严格检测模式');
    }
  }

  // 禁用严格模式（降低误报率，默认状态）
  public disableStrictDetection(): void {
    this.enableStrictMode = false;
    if (this.debugMode) {
      this.safeLog('log', '🔓 已禁用严格检测模式，降低误报率');
    }
  }

  // 获取当前检测模式
  public getDetectionMode(): { strict: boolean; description: string } {
    return {
      strict: this.enableStrictMode,
      description: this.enableStrictMode
        ? '严格模式：更激进的检测，可能有更多误报'
        : '正常模式：平衡检测，降低误报率'
    };
  }

  // 完全禁用完整性检查
  public disable(): void {
    this.isInRecoveryMode = true;
    this.proxyDetectionEnabled = false;
    this.enableStrictMode = false;

    // 清理所有定时器
    if (this.recoveryInterval) {
      clearInterval(this.recoveryInterval);
      this.recoveryInterval = null;
    }
    if (this.networkMonitorInterval) {
      clearInterval(this.networkMonitorInterval);
      this.networkMonitorInterval = null;
    }

    if (this.debugMode) {
      this.safeLog('log', '🚫 完整性检查已完全禁用');
    }
  }

  // 检查是否已禁用
  public isDisabled(): boolean {
    return this.isInRecoveryMode && !this.proxyDetectionEnabled;
  }

  // 安全的DOM操作包装器
  private safeDOMOperation(operation: () => void): void {
    try {
      operation();
    } catch (error) {
      this.safeLog('error', '❌ DOM操作失败:', error);
      // 不抛出错误，避免影响页面正常功能
    }
  }

  // 安全的文本恢复
  private safeTextRecovery(node: Node, originalText: string): void {
    this.safeDOMOperation(() => {
      if (node.textContent && node.textContent !== originalText) {
        node.textContent = originalText;
        if (this.debugMode) {
          this.safeLog('log', '✅ 文本已安全恢复:', originalText);
        }
      }
    });
  }

  private checkIfNormalUpdate(currentContent: string): boolean {
    // 检查是否是正常的页面更新（如动态加载内容）

    // 1. 检查是否只是添加了内容（而不是替换）
    if (currentContent.length > this.originalPageContent.length) {
      const addedContent = currentContent.replace(this.originalPageContent, '');
      if (addedContent.length > 50) {
        return true; // 可能是正常的内容添加
      }
    }

    // 2. 检查是否包含常见的动态内容标识
    const dynamicContentPatterns = [
      /loading/gi,
      /spinner/gi,
      /progress/gi,
      /data-loaded/gi,
      /dynamic-content/gi
    ];

    if (dynamicContentPatterns.some(pattern => pattern.test(currentContent))) {
      return true;
    }

    // 3. 检查时间戳或随机ID（动态生成的内容）
    const timestampPatterns = [
      /\d{13,}/g, // 时间戳
      /[a-f0-9]{8,}/gi, // 随机ID
      /t=\d+/gi // URL参数
    ];

    if (timestampPatterns.some(pattern => pattern.test(currentContent))) {
      return true;
    }

    return false;
  }

  // ========== 手动触发篡改检测的公共接口 ==========

  /**
   * 手动触发完整性检查
   * @param options 检查选项
   */
  public manualCheck(options: {
    checkType?: 'all' | 'dom' | 'network' | 'text' | 'baseline';
    elementId?: string;
    forceCheck?: boolean;
  } = {}): Promise<{
    success: boolean;
    results: any[];
    errors: string[];
  }> {
    return new Promise((resolve) => {
      const results: any[] = [];
      const errors: string[] = [];

      try {
        if (this.debugMode) {
          this.safeLog('log', '🔍 手动触发完整性检查...', options);
        }

        const { checkType = 'all', elementId, forceCheck = false } = options;

        // 如果系统被禁用且不是强制检查，直接返回
        if (this.isDisabled() && !forceCheck) {
          errors.push('完整性检查系统已被禁用');
          return resolve({ success: false, results, errors });
        }

        // 如果在豁免页面且不是强制检查，跳过
        if (this.isExemptPage() && !forceCheck) {
          results.push({ type: 'exempt', message: '当前页面已豁免完整性检查' });
          return resolve({ success: true, results, errors });
        }

        // 执行不同类型的检查
        if (checkType === 'all' || checkType === 'baseline') {
          const baselineResult = this.checkBaselineIntegrity();
          results.push({ type: 'baseline', ...baselineResult });
        }

        if (checkType === 'all' || checkType === 'dom') {
          const domResult = this.checkDOMIntegrity(elementId);
          results.push({ type: 'dom', ...domResult });
        }

        if (checkType === 'all' || checkType === 'text') {
          const textResult = this.checkCriticalTexts();
          results.push({ type: 'text', ...textResult });
        }

        if (checkType === 'all' || checkType === 'network') {
          const networkResult = this.checkNetworkIntegrityStatus();
          results.push({ type: 'network', ...networkResult });
        }

        resolve({ success: errors.length === 0, results, errors });

      } catch (error) {
        errors.push(`检查过程中发生错误: ${error instanceof Error ? error.message : String(error)}`);
        resolve({ success: false, results, errors });
      }
    });
  }

  /**
   * 手动报告篡改事件
   * @param eventData 篡改事件数据
   */
  public manualReportTampering(eventData: {
    eventType: string;
    elementId?: string;
    originalContent?: string;
    tamperContent?: string;
    tamperType?: 'dom' | 'network' | 'proxy' | 'injection';
    detectionMethod?: string;
    additionalInfo?: Record<string, any>;
  }): Promise<{ success: boolean; message: string }> {
    return new Promise((resolve) => {
      try {
        if (this.debugMode) {
          this.safeLog('log', '📤 手动报告篡改事件...', eventData);
        }

        const tamperEvent: TamperEvent = {
          elementId: eventData.elementId || 'manual-report',
          timestamp: new Date().toISOString(),
          url: window.location.href,
          eventType: eventData.eventType,
          tamperType: eventData.tamperType || 'dom',
          detectionMethod: eventData.detectionMethod || 'manual-report',
          originalContent: eventData.originalContent,
          tamperContent: eventData.tamperContent,
          filePath: window.location.pathname,
          checksum: eventData.originalContent ? this.calculateChecksum(eventData.originalContent) : undefined,
          attempts: 1,
          additionalInfo: {
            ...eventData.additionalInfo,
            manualReport: true,
            userAgent: navigator.userAgent,
            screenResolution: `${screen.width}x${screen.height}`,
            timestamp: Date.now(),
            pageTitle: document.title,
            referrer: document.referrer
          }
        };

        this.reportTampering(tamperEvent);
        resolve({ success: true, message: '篡改事件已成功报告' });

      } catch (error) {
        const message = `报告篡改事件失败: ${error instanceof Error ? error.message : String(error)}`;
        resolve({ success: false, message });
      }
    });
  }

  /**
   * 手动触发恢复模式
   * @param options 恢复选项
   */
  public manualRecovery(options: {
    recoveryType?: 'emergency' | 'soft' | 'baseline';
    showWarning?: boolean;
  } = {}): { success: boolean; message: string } {
    try {
      const { recoveryType = 'soft', showWarning = true } = options;

      if (this.debugMode) {
        this.safeLog('log', '🔄 手动触发恢复模式...', options);
      }

      if (recoveryType === 'emergency') {
        this.performEmergencyRecovery();
        if (showWarning) {
          this.showProxyTamperWarning();
        }
        return { success: true, message: '紧急恢复模式已启动' };
      } else if (recoveryType === 'baseline') {
        this.captureBaselineContent();
        return { success: true, message: '基准内容已重新捕获' };
      } else {
        this.performRecovery();
        return { success: true, message: '软恢复模式已启动' };
      }

    } catch (error) {
      const message = `恢复模式启动失败: ${error instanceof Error ? error.message : String(error)}`;
      return { success: false, message };
    }
  }

  /**
   * 手动模拟篡改事件（测试用）
   * @param options 模拟选项
   */
  public simulateTampering(options: {
    tamperType: 'dom' | 'network' | 'proxy' | 'injection';
    elementId?: string;
    testContent?: string;
  }): { success: boolean; message: string } {
    try {
      if (this.debugMode) {
        this.safeLog('log', '🧪 模拟篡改事件...', options);
      }

      const { tamperType, elementId = 'test-element', testContent = 'Test Tampered Content' } = options;

      // 模拟不同类型的篡改
      switch (tamperType) {
        case 'dom':
          this.handleTampering(elementId, 'Original Content', testContent, 'dom', 'simulation');
          break;
        case 'network':
          this.handleNetworkTampering('/test-url', 'Original Response', testContent);
          break;
        case 'proxy':
          this.handleProxyTampering({
            hasProxyTampering: true,
            replacedTexts: ['Happy TTS'],
            addedContent: [],
            removedContent: [],
            confidence: 80
          });
          break;
        case 'injection':
          this.handleTampering(elementId, 'Original Script', testContent, 'injection', 'simulation');
          break;
      }

      return { success: true, message: `${tamperType} 类型的篡改事件已模拟` };

    } catch (error) {
      const message = `模拟篡改事件失败: ${error instanceof Error ? error.message : String(error)}`;
      return { success: false, message };
    }
  }

  // ========== 内部检查方法 ==========

  private checkBaselineIntegrity(): {
    isValid: boolean;
    currentLength: number;
    baselineLength: number;
    checksum: string;
    message: string;
  } {
    const currentContent = document.documentElement.outerHTML;
    const currentChecksum = this.calculateChecksum(currentContent);
    const currentLength = currentContent.length;
    const baselineLength = this.originalPageContent.length;

    const isValid = currentChecksum === this.baselineChecksum && baselineLength > 0;

    return {
      isValid,
      currentLength,
      baselineLength,
      checksum: currentChecksum,
      message: isValid ? '基准内容完整' : '基准内容已被修改'
    };
  }

  private checkDOMIntegrity(targetElementId?: string): {
    checkedElements: number;
    tamperedElements: string[];
    message: string;
  } {
    const tamperedElements: string[] = [];
    let checkedElements = 0;

    if (targetElementId) {
      // 检查特定元素
      const element = document.getElementById(targetElementId);
      if (element) {
        checkedElements = 1;
        const currentContent = element.innerHTML;
        if (!this.verifyIntegrity(targetElementId, currentContent)) {
          tamperedElements.push(targetElementId);
        }
      }
    } else {
      // 检查所有关键元素
      const criticalElements = ['app-header', 'app-footer', 'tts-form', 'legal-notice'];
      criticalElements.forEach(id => {
        const element = document.getElementById(id);
        if (element) {
          checkedElements++;
          const currentContent = element.innerHTML;
          if (!this.verifyIntegrity(id, currentContent)) {
            tamperedElements.push(id);
          }
        }
      });
    }

    return {
      checkedElements,
      tamperedElements,
      message: tamperedElements.length === 0 ? 'DOM元素完整' : `发现 ${tamperedElements.length} 个被篡改的元素`
    };
  }

  private checkCriticalTexts(): {
    checkedTexts: string[];
    missingTexts: string[];
    message: string;
  } {
    const protectedTexts = ['SynapticArch', 'Happy TTS', 'Happy'];
    const bodyText = document.body.innerText;
    const missingTexts: string[] = [];

    protectedTexts.forEach(text => {
      const regex = new RegExp(text.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&'), 'g');
      if (!regex.test(bodyText)) {
        missingTexts.push(text);
      }
    });

    return {
      checkedTexts: protectedTexts,
      missingTexts,
      message: missingTexts.length === 0 ? '关键文本完整' : `缺失关键文本: ${missingTexts.join(', ')}`
    };
  }

  private checkNetworkIntegrityStatus(): {
    monitoredUrls: number;
    tamperedUrls: string[];
    message: string;
  } {
    const tamperedUrls: string[] = [];
    const monitoredUrls = this.networkIntegrityMap.size;

    // 这里可以添加更详细的网络完整性检查逻辑

    return {
      monitoredUrls,
      tamperedUrls,
      message: tamperedUrls.length === 0 ? '网络完整性正常' : `发现 ${tamperedUrls.length} 个被篡改的网络响应`
    };
  }

  // ========== 品牌保护专用方法 ==========

  /**
   * 检查是否为品牌保护元素
   */
  private isBrandProtectedElement(elementId: string): boolean {
    const brandProtectedIds = [
      'app-header-container',
      'app-header-content',
      'app-brand-logo',
      'app-brand-icon',
      'app-brand-text'
    ];
    return brandProtectedIds.includes(elementId);
  }

  /**
   * 处理品牌标识篡改（最高优先级）
   */
  private handleBrandTampering(elementId: string, element: Element): void {
    if (this.debugMode) {
      this.safeLog('error', '🚨 检测到品牌标识篡改！', { elementId, element: element.outerHTML });
    }

    // 立即恢复品牌内容
    this.restoreBrandElement(elementId, element);

    // 显示最高级别警告
    this.showCriticalBrandWarning(elementId);

    // 上报品牌篡改事件
    this.handleTampering(elementId, undefined, undefined, 'dom', 'brand-protection');

    // 启动品牌保护模式
    this.activateBrandProtectionMode();
  }

  /**
   * 恢复品牌元素内容
   */
  private restoreBrandElement(elementId: string, element: Element): void {
    try {
      switch (elementId) {
        case 'app-brand-text':
          // 恢复品牌文本
          if (element.textContent !== 'Happy TTS') {
            element.textContent = 'Happy TTS';
            element.setAttribute('data-original-text', 'Happy TTS');
            element.setAttribute('data-critical-text', 'Happy TTS');
          }
          break;

        case 'app-brand-icon':
          // 恢复品牌图标路径
          const path = element.querySelector('path');
          if (path) {
            path.setAttribute('d', 'M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z');
          }
          break;

        case 'app-brand-logo':
        case 'app-header-content':
        case 'app-header-container':
          // 对于容器元素，检查并恢复子元素
          this.restoreBrandContainerContent(element);
          break;
      }

      if (this.debugMode) {
        this.safeLog('log', '✅ 品牌元素已恢复:', elementId);
      }
    } catch (error) {
      this.safeLog('error', '❌ 恢复品牌元素失败:', { elementId, error });
    }
  }

  /**
   * 恢复品牌容器内容
   */
  private restoreBrandContainerContent(container: Element): void {
    // 检查品牌文本
    const brandTextElement = container.querySelector('#app-brand-text');
    if (brandTextElement && brandTextElement.textContent !== 'Happy TTS') {
      brandTextElement.textContent = 'Happy TTS';
    }

    // 检查品牌图标
    const brandIcon = container.querySelector('#app-brand-icon path');
    if (brandIcon) {
      const expectedPath = 'M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z';
      if (brandIcon.getAttribute('d') !== expectedPath) {
        brandIcon.setAttribute('d', expectedPath);
      }
    }
  }

  /**
   * 显示关键品牌警告
   */
  private showCriticalBrandWarning(elementId: string): void {
    const warning = document.createElement('div');
    warning.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(255, 0, 0, 0.95);
      color: white;
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: center;
      z-index: 99999;
      font-family: Arial, sans-serif;
      text-align: center;
      animation: criticalPulse 1s infinite;
    `;

    warning.innerHTML = `
      <div style="font-size: 3em; margin-bottom: 20px;">🚨</div>
      <h1 style="font-size: 2em; margin-bottom: 10px;">严重安全警告</h1>
      <p style="font-size: 1.2em; margin-bottom: 20px;">检测到品牌标识被恶意篡改！</p>
      <p style="font-size: 1em; opacity: 0.9;">元素ID: ${elementId}</p>
      <p style="font-size: 1em; opacity: 0.9;">系统已自动恢复并记录此事件</p>
      <div style="margin-top: 30px; font-size: 0.9em;">
        页面将在 <span id="brand-countdown">10</span> 秒后自动关闭
      </div>
    `;

    // 添加动画样式
    const style = document.createElement('style');
    style.textContent = `
      @keyframes criticalPulse {
        0%, 100% { background: rgba(255, 0, 0, 0.95); }
        50% { background: rgba(255, 100, 100, 0.95); }
      }
    `;
    document.head.appendChild(style);

    document.body.appendChild(warning);

    // 倒计时关闭
    let countdown = 10;
    const interval = setInterval(() => {
      countdown--;
      const countdownElement = warning.querySelector('#brand-countdown');
      if (countdownElement) {
        countdownElement.textContent = countdown.toString();
      }

      if (countdown <= 0) {
        clearInterval(interval);
        window.close();
      }
    }, 1000);
  }

  /**
   * 激活品牌保护模式
   */
  private activateBrandProtectionMode(): void {
    if (this.debugMode) {
      this.safeLog('log', '🛡️ 激活品牌保护模式');
    }

    // 增加检查频率
    this.networkCheckInterval = 100; // 100ms检查一次

    // 启动品牌保护监控
    const brandProtectionInterval = setInterval(() => {
      this.checkBrandProtectionIntegrity();
    }, 50); // 每50ms检查一次品牌区域

    // 5分钟后恢复正常频率
    setTimeout(() => {
      clearInterval(brandProtectionInterval);
      this.networkCheckInterval = 1000;
      if (this.debugMode) {
        this.safeLog('log', '🛡️ 品牌保护模式已结束，恢复正常监控');
      }
    }, 300000);
  }

  /**
   * 检查品牌保护区域完整性
   */
  private checkBrandProtectionIntegrity(): void {
    // 检查品牌文本
    const brandTextElement = document.getElementById('app-brand-text');
    if (brandTextElement) {
      const expectedText = 'Happy TTS';
      if (brandTextElement.textContent !== expectedText) {
        if (this.debugMode) {
          this.safeLog('warn', '🚨 品牌文本被篡改:', {
            expected: expectedText,
            actual: brandTextElement.textContent
          });
        }
        this.handleBrandTampering('app-brand-text', brandTextElement);
      }
    }

    // 检查品牌图标
    const brandIcon = document.querySelector('#app-brand-icon path');
    if (brandIcon) {
      const expectedPath = 'M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z';
      const actualPath = brandIcon.getAttribute('d');
      if (actualPath !== expectedPath) {
        if (this.debugMode) {
          this.safeLog('warn', '🚨 品牌图标被篡改');
        }
        this.handleBrandTampering('app-brand-icon', brandIcon.parentElement!);
      }
    }

    // 检查关键属性
    const protectedElements = [
      'app-header-container',
      'app-header-content',
      'app-brand-logo',
      'app-brand-icon',
      'app-brand-text'
    ];

    protectedElements.forEach(id => {
      const element = document.getElementById(id);
      if (element) {
        // 检查关键属性是否被移除
        const requiredAttributes = ['data-integrity', 'data-protection'];
        const missingAttributes = requiredAttributes.filter(attr => !element.hasAttribute(attr));

        if (missingAttributes.length > 0) {
          if (this.debugMode) {
            this.safeLog('warn', '🚨 品牌元素关键属性被移除:', {
              elementId: id,
              missingAttributes
            });
          }

          // 恢复关键属性
          this.restoreBrandElementAttributes(element, id);
        }
      }
    });
  }

  /**
   * 设置品牌保护区域的完整性基准
   */
  private setupBrandProtectionBaseline(): void {
    try {
      const brandProtectedIds = [
        'app-header-container',
        'app-header-content',
        'app-brand-logo',
        'app-brand-icon',
        'app-brand-text'
      ];

      brandProtectedIds.forEach(id => {
        const element = document.getElementById(id);
        if (element) {
          // 为品牌保护元素设置完整性基准
          this.setIntegrity(id, element.innerHTML);

          if (this.debugMode) {
            this.safeLog('log', `🛡️ 品牌保护基准已设置: ${id}`, {
              contentLength: element.innerHTML.length,
              textContent: element.textContent?.substring(0, 50) + '...'
            });
          }
        }
      });

      // 特别设置品牌文本的基准
      const brandTextElement = document.getElementById('app-brand-text');
      if (brandTextElement) {
        this.setIntegrity('brand-text-content', brandTextElement.textContent || '');
      }

      // 设置品牌图标路径的基准
      const brandIconPath = document.querySelector('#app-brand-icon path');
      if (brandIconPath) {
        const pathData = brandIconPath.getAttribute('d') || '';
        this.setIntegrity('brand-icon-path', pathData);
      }

    } catch (error) {
      this.safeLog('error', '❌ 设置品牌保护基准失败:', error);
    }
  }

  /**
   * 恢复品牌元素属性
   */
  private restoreBrandElementAttributes(element: Element, elementId: string): void {
    switch (elementId) {
      case 'app-header-container':
        element.setAttribute('data-integrity', 'critical');
        element.setAttribute('data-protection', 'maximum');
        element.setAttribute('data-component', 'AppHeader');
        break;

      case 'app-header-content':
        element.setAttribute('data-integrity', 'critical');
        break;

      case 'app-brand-logo':
        element.setAttribute('data-integrity', 'critical');
        element.setAttribute('data-protection', 'brand-identity');
        element.setAttribute('data-critical-text', 'Happy TTS');
        break;

      case 'app-brand-icon':
        element.setAttribute('data-integrity', 'critical');
        element.setAttribute('data-protection', 'brand-icon');
        break;

      case 'app-brand-text':
        element.setAttribute('data-integrity', 'critical');
        element.setAttribute('data-protection', 'brand-text');
        element.setAttribute('data-critical-text', 'Happy TTS');
        element.setAttribute('data-original-text', 'Happy TTS');
        break;
    }

    if (this.debugMode) {
      this.safeLog('log', '✅ 品牌元素属性已恢复:', elementId);
    }
  }

  // 检查当前页面是否被豁免（调试用）
  public checkExemptStatus(): {
    isExempt: boolean;
    isTrustedUrl: boolean;
    exemptReasons: string[];
  } {
    const exemptReasons: string[] = [];
    let isExempt = false;
    let isTrustedUrl = false;

    try {
      const href = window.location.href;
      const pathname = window.location.pathname || '';
      const title = (document.title || '').toLowerCase();

      // 检查可信URL
      isTrustedUrl = this.isTrustedUrl(href);
      if (isTrustedUrl) {
        exemptReasons.push('可信URL');
        isExempt = true;
      }

      // 检查路径豁免
      const exemptPathKeywords = [
        '/upload', '/image', '/images', '/img',
        '/fbi', '/wanted', '/public', '/docs', '/api-docs',
        '/resource', '/resources', '/short', '/shortlink', '/short-links',
        '/cdk', '/cdk-store', '/librechat',
        '/verification', '/verify', '/first-visit', '/captcha', '/turnstile'
      ];

      const matchedPaths = exemptPathKeywords.filter(k => pathname.toLowerCase().includes(k));
      if (matchedPaths.length > 0) {
        exemptReasons.push(`路径豁免: ${matchedPaths.join(', ')}`);
        isExempt = true;
      }

      // 检查标题豁免
      const exemptTitleKeywords = [
        'upload', 'image', 'markdown', 'api', 'docs', 'documentation',
        'fbi', 'wanted', 'shortlink', 'short link', 'cdk', 'store', 'librechat',
        'verification', 'verify', 'first visit', 'captcha', 'turnstile', 'security'
      ];

      const matchedTitles = exemptTitleKeywords.filter(k => title.includes(k));
      if (matchedTitles.length > 0) {
        exemptReasons.push(`标题豁免: ${matchedTitles.join(', ')}`);
        isExempt = true;
      }

      // 检查组件标记豁免
      const foundMarkers: string[] = [];
      for (const marker of this.COMPONENT_EXEMPT_MARKERS) {
        const selectors = [
          `[data-component="${marker}"]`,
          `[data-page="${marker}"]`,
          `[data-view="${marker}"]`,
          `#${CSS.escape(marker)}`,
          `[id*="${marker}"]`,
          `[class*="${marker}"]`
        ];

        for (const selector of selectors) {
          if (document.querySelector(selector)) {
            foundMarkers.push(`${marker} (${selector})`);
            break;
          }
        }
      }

      if (foundMarkers.length > 0) {
        exemptReasons.push(`组件标记豁免: ${foundMarkers.join(', ')}`);
        isExempt = true;
      }

      return {
        isExempt,
        isTrustedUrl,
        exemptReasons
      };
    } catch (error) {
      this.safeLog('error', '❌ 检查豁免状态时出错:', error);
      return {
        isExempt: false,
        isTrustedUrl: false,
        exemptReasons: ['检查失败']
      };
    }
  }
}

export const integrityChecker = IntegrityChecker.getInstance(); 