import CryptoJS from 'crypto-js';

interface IntegrityData {
  content: string;
  hash: string;
  timestamp: number;
}

interface TamperEvent {
  elementId: string;
  timestamp: string;
  url: string;
  originalContent?: string;
  tamperContent?: string;
  attempts?: number;
}

class IntegrityChecker {
  private static instance: IntegrityChecker;
  private integrityMap: Map<string, IntegrityData> = new Map();
  private readonly SECRET_KEY = import.meta.env.VITE_INTEGRITY_KEY || 'your-integrity-key';
  private tamperAttempts: Map<string, number> = new Map();
  private readonly MAX_ATTEMPTS = 3;
  private isInRecoveryMode = false;
  private recoveryInterval: number | null = null;

  private constructor() {
    this.initializeIntegrityCheck();
    this.initializeRecoveryMode();
  }

  public static getInstance(): IntegrityChecker {
    if (!IntegrityChecker.instance) {
      IntegrityChecker.instance = new IntegrityChecker();
    }
    return IntegrityChecker.instance;
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

  private calculateHash(content: string): string {
    return CryptoJS.HmacSHA256(content, this.SECRET_KEY).toString();
  }

  public setIntegrity(elementId: string, content: string): void {
    const hash = this.calculateHash(content);
    this.integrityMap.set(elementId, {
      content,
      hash,
      timestamp: Date.now()
    });
  }

  public verifyIntegrity(elementId: string, content: string): boolean {
    const data = this.integrityMap.get(elementId);
    if (!data) return false;

    const currentHash = this.calculateHash(content);
    return currentHash === data.hash;
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

  private handleTampering(elementId: string, originalContent?: string, tamperContent?: string): void {
    const tamperEvent: TamperEvent = {
      elementId,
      timestamp: new Date().toISOString(),
      url: window.location.href,
      originalContent,
      tamperContent,
      attempts: this.tamperAttempts.get(elementId)
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
    `;
    document.body.prepend(warning);

    // 添加动画样式
    const style = document.createElement('style');
    style.textContent = `
      @keyframes slideDown {
        from { transform: translateY(-100%); }
        to { transform: translateY(0); }
      }
    `;
    document.head.appendChild(style);
  }
}

export const integrityChecker = IntegrityChecker.getInstance(); 