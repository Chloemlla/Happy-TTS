import CryptoJS from 'crypto-js';

interface IntegrityData {
  content: string;
  hash: string;
  timestamp: number;
  checksum: string;
  signature: string;
}

interface TamperEvent {
  elementId: string;
  timestamp: string;
  url: string;
  originalContent?: string;
  tamperContent?: string;
  attempts?: number;
  tamperType?: 'dom' | 'network' | 'proxy' | 'injection';
  detectionMethod?: string;
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
  private readonly NETWORK_CHECK_INTERVAL = 1000; // 1秒检查一次网络完整性

  private constructor() {
    this.initializeIntegrityCheck();
    this.initializeRecoveryMode();
    this.initializeNetworkMonitoring();
    this.initializeProxyDetection();
    this.captureBaselineContent();
  }

  public static getInstance(): IntegrityChecker {
    if (!IntegrityChecker.instance) {
      IntegrityChecker.instance = new IntegrityChecker();
    }
    return IntegrityChecker.instance;
  }

  private captureBaselineContent(): void {
    // 捕获页面初始状态的基准内容
    this.originalPageContent = document.documentElement.outerHTML;
    this.baselineChecksum = this.calculateChecksum(this.originalPageContent);
    
    // 存储关键文本的基准状态
    const criticalTexts = this.extractCriticalTexts();
    criticalTexts.forEach((text, index) => {
      this.setIntegrity(`critical-text-${index}`, text);
    });
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
    
    // 定期检查网络完整性
    this.networkMonitorInterval = window.setInterval(() => {
      this.checkNetworkIntegrity();
    }, this.NETWORK_CHECK_INTERVAL);
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
    
    XMLHttpRequest.prototype.open = function(method: string, url: string, async?: boolean, username?: string, password?: string) {
      this._integrityUrl = url;
      return originalXHROpen.call(this, method, url, async ?? true, username, password);
    };

    XMLHttpRequest.prototype.send = function(...args: any[]) {
      const xhr = this;
      const originalOnReadyStateChange = xhr.onreadystatechange;
      
      xhr.onreadystatechange = function() {
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
    if (response.headers.get('content-type')?.includes('text/html')) {
      response.text().then(text => {
        this.checkResponseIntegrity(text, url);
      }).catch(console.error);
    }
  }

  private analyzeXHRResponse(xhr: XMLHttpRequest): void {
    const contentType = xhr.getResponseHeader('content-type');
    if (contentType?.includes('text/html') && xhr._integrityUrl) {
      this.checkResponseIntegrity(xhr.responseText, xhr._integrityUrl);
    }
  }

  private checkResponseIntegrity(content: string, url: string): void {
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
    // 检测代理相关的HTTP头
    this.detectProxyHeaders();
    
    // 检测响应时间异常（代理可能增加延迟）
    this.detectResponseTimeAnomalies();
    
    // 检测内容长度变化
    this.detectContentLengthChanges();
  }

  private detectProxyHeaders(): void {
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
        console.warn('检测到代理服务器，增强监控模式已启用');
        this.enableEnhancedMonitoring();
      }
    }).catch(() => {
      // 如果测试失败，假设可能存在代理
      this.enableEnhancedMonitoring();
    });
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
  }

  private detectContentLengthChanges(): void {
    // 监控页面内容长度变化
    const currentLength = document.documentElement.outerHTML.length;
    const baselineLength = this.originalPageContent.length;
    
    if (Math.abs(currentLength - baselineLength) > 100) {
      this.handleContentLengthAnomaly(currentLength, baselineLength);
    }
  }

  private handleContentLengthAnomaly(current: number, baseline: number): void {
    console.warn(`检测到内容长度异常: 基准=${baseline}, 当前=${current}`);
    this.checkPageIntegrity();
  }

  private checkNetworkIntegrity(): void {
    const now = Date.now();
    if (now - this.lastNetworkCheck < this.NETWORK_CHECK_INTERVAL) {
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
  } {
    const result = {
      hasProxyTampering: false,
      replacedTexts: [] as string[],
      addedContent: [] as string[],
      removedContent: [] as string[]
    };

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
    }

    // 检查关键文本是否被替换
    const criticalTexts = ['Happy-clo', 'Synapse', 'Happy'];
    criticalTexts.forEach(text => {
      const pattern = new RegExp(text.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&'), 'gi');
      if (!pattern.test(currentContent)) {
        result.replacedTexts.push(text);
        result.hasProxyTampering = true;
      }
    });

    return result;
  }

  private handleProxyTampering(changes: any): void {
    console.error('检测到代理篡改行为！', changes);
    
    // 立即恢复原始内容
    this.performEmergencyRecovery();
    
    // 记录篡改事件
    this.handleTampering('proxy-tampering', undefined, undefined, 'proxy', 'network-analysis');
    
    // 显示代理篡改警告
    this.showProxyTamperWarning();
  }

  private performEmergencyRecovery(): void {
    // 紧急恢复模式
    this.isInRecoveryMode = true;
    
    // 恢复原始页面内容
    document.documentElement.innerHTML = this.originalPageContent;
    
    // 重新初始化关键元素
    this.reinitializeCriticalElements();
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
      animation: proxyWarning 2s infinite;
    `;
    warning.innerHTML = `
      <div style="font-size: 1.2em; margin-bottom: 5px;">🚨 代理篡改检测</div>
      <div style="font-size: 0.9em;">检测到通过代理服务器的内容篡改！系统已启动紧急恢复模式。</div>
    `;
    document.body.prepend(warning);

    // 添加动画样式
    const style = document.createElement('style');
    style.textContent = `
      @keyframes proxyWarning {
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

    // 定期检查
    setInterval(() => this.checkPageIntegrity(), 2000);
  }

  private handleMutation(mutation: MutationRecord): void {
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
    const protectedPatterns = [
      { original: 'Happy-clo', pattern: /Happy[-]?clo/gi },
      { original: 'Synapse', pattern: /Happy\s*TTS/gi },
      { original: 'Happy', pattern: /Happy(?![-\s]?(clo|tts))/gi }
    ];

    protectedPatterns.forEach(({ original, pattern }) => {
      if (text.match(pattern) && text !== original) {
        this.handleTextTampering(node, text, original);
      }
    });
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
    const protectedTexts = ['Happy-clo', 'Synapse', 'Happy'];
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
    // 检查关键元素
    const criticalElements = [
      'app-header',
      'app-footer',
      'tts-form',
      'legal-notice'
    ];

    criticalElements.forEach(id => {
      const element = document.getElementById(id);
      if (element) {
        const currentContent = element.innerHTML;
        if (!this.verifyIntegrity(id, currentContent)) {
          console.error(`检测到页面元素 ${id} 被篡改！`);
          // 可以在这里添加恢复或报警逻辑
          this.handleTampering(id);
        }
      }
    });

    // 检查特定文本
    this.checkTextIntegrity();
  }

  private checkTextIntegrity(): void {
    const protectedTexts = ['Happy-clo', 'Synapse', 'Happy'];
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
    const tamperEvent: TamperEvent = {
      elementId,
      timestamp: new Date().toISOString(),
      url: window.location.href,
      originalContent,
      tamperContent,
      attempts: this.tamperAttempts.get(elementId),
      tamperType,
      detectionMethod
    };
    
    this.reportTampering(tamperEvent);
    this.showTamperWarning(tamperEvent);
  }

  private reportTampering(event: TamperEvent): void {
    // 发送篡改事件到服务器
    fetch('/api/report-tampering', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(event)
    }).catch(console.error);
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
        元素: ${event.elementId} | 
        时间: ${new Date(event.timestamp).toLocaleTimeString()} | 
        尝试次数: ${event.attempts}/${this.MAX_ATTEMPTS}
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
        window.dispatchEvent(new Event('show-synapse-watermark'));
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
}

export const integrityChecker = IntegrityChecker.getInstance(); 