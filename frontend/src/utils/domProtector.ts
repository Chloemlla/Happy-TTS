import { signContent, verifyContent } from './sign';

interface DOMSnapshot {
  content: string;
  signature: string;
  timestamp: number;
}

interface ProtectedText {
  original: string;
  pattern: RegExp;
}

class DOMProtector {
  private static instance: DOMProtector;
  private snapshots: Map<string, DOMSnapshot> = new Map();
  private observer: MutationObserver | null = null;
  private checkInterval: number | null = null;
  private protectedTexts: ProtectedText[] = [
    { original: 'SynapticArch', pattern: /SynapticArch/gi },
    { original: 'Synapse', pattern: /Synapse/gi },
    { original: 'Happy', pattern: /Happy(?![\w-])/gi }  // 防止匹配 SynapticArch
  ];

  private constructor() {
    // 私有构造函数，确保单例
  }

  public static getInstance(): DOMProtector {
    if (!DOMProtector.instance) {
      DOMProtector.instance = new DOMProtector();
    }
    return DOMProtector.instance;
  }

  // 检查并修复受保护的文本
  private checkProtectedText(node: Node): boolean {
    if (node.nodeType === Node.TEXT_NODE && node.textContent) {
      let textContent = node.textContent;
      let hasChange = false;

      this.protectedTexts.forEach(({ original, pattern }) => {
        if (pattern.test(textContent)) {
          textContent = textContent.replace(pattern, original);
          hasChange = true;
        }
      });

      if (hasChange) {
        node.textContent = textContent;
        return true;
      }
    }
    return false;
  }

  // 递归检查所有文本节点
  private checkAllTextNodes(element: HTMLElement): void {
    const walker = document.createTreeWalker(
      element,
      NodeFilter.SHOW_TEXT,
      null
    );

    let node: Node | null;
    while (node = walker.nextNode()) {
      this.checkProtectedText(node);
    }
  }

  // 为指定元素创建快照
  public takeSnapshot(element: HTMLElement, id: string): void {
    // 先检查和修复受保护的文本
    this.checkAllTextNodes(element);

    const content = element.innerHTML;
    const signature = signContent(content);
    this.snapshots.set(id, {
      content,
      signature,
      timestamp: Date.now()
    });
  }

  // 验证元素完整性
  public verifyElement(element: HTMLElement, id: string): boolean {
    const snapshot = this.snapshots.get(id);
    if (!snapshot) return false;

    // 先检查受保护的文本
    let hasTextChange = false;
    const walker = document.createTreeWalker(
      element,
      NodeFilter.SHOW_TEXT,
      null
    );

    let node: Node | null;
    while (node = walker.nextNode()) {
      if (this.checkProtectedText(node)) {
        hasTextChange = true;
      }
    }

    // 如果文本被修改，重新创建快照
    if (hasTextChange) {
      this.takeSnapshot(element, id);
      return true;
    }

    const currentContent = element.innerHTML;
    return verifyContent(currentContent, snapshot.signature);
  }

  // 恢复元素原始内容
  public restoreElement(element: HTMLElement, id: string): void {
    const snapshot = this.snapshots.get(id);
    if (snapshot) {
      element.innerHTML = snapshot.content;
    }
  }

  // 开始监控指定元素
  public startMonitoring(element: HTMLElement, id: string): void {
    this.takeSnapshot(element, id);

    // 设置 MutationObserver
    this.observer = new MutationObserver((mutations) => {
      let needsRestore = false;

      mutations.forEach(mutation => {
        if (mutation.type === 'characterData') {
          // 文本内容变化
          if (this.checkProtectedText(mutation.target)) {
            needsRestore = true;
          }
        } else if (mutation.type === 'childList') {
          // 新增节点，检查其中的文本
          mutation.addedNodes.forEach(node => {
            if (node.nodeType === Node.ELEMENT_NODE) {
              this.checkAllTextNodes(node as HTMLElement);
            } else if (node.nodeType === Node.TEXT_NODE) {
              if (this.checkProtectedText(node)) {
                needsRestore = true;
              }
            }
          });
        }
      });

      if (needsRestore || !this.verifyElement(element, id)) {
        console.warn(`检测到 DOM 元素 ${id} 被篡改，正在恢复...`);
        this.restoreElement(element, id);
      }
    });

    this.observer.observe(element, {
      childList: true,
      subtree: true,
      attributes: true,
      characterData: true
    });

    // 设置定期检查
    this.checkInterval = window.setInterval(() => {
      if (!this.verifyElement(element, id)) {
        console.warn(`定期检查发现 DOM 元素 ${id} 被篡改，正在恢复...`);
        this.restoreElement(element, id);
      }
    }, 2000);
  }

  // 停止监控
  public stopMonitoring(): void {
    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
  }

  // 添加新的受保护文本
  public addProtectedText(text: string): void {
    this.protectedTexts.push({
      original: text,
      pattern: new RegExp(text.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&'), 'gi')
    });
  }
}

export const domProtector = DOMProtector.getInstance(); 