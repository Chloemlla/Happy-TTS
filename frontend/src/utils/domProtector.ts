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
  // G9-15：用 Map 管理多元素的 observer/interval，避免单引用覆盖导致旧 observer 泄漏
  private monitors: Map<string, { observer: MutationObserver; interval: number }> = new Map();
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
        // G9-15：/gi 正则的 test() 依赖 lastIndex，连续调用会交替漏判，先复位
        pattern.lastIndex = 0;
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

  // 恢复元素原始内容（G9-15：只修复受保护文本，避免 innerHTML 整段覆盖 React 管理的子树）
  public restoreElement(element: HTMLElement, _id: string): void {
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, null);
    let node: Node | null;
    while ((node = walker.nextNode())) {
      if (node.textContent) {
        let text = node.textContent;
        let hasChange = false;
        for (const { original, pattern } of this.protectedTexts) {
          pattern.lastIndex = 0;
          if (pattern.test(text)) {
            text = text.replace(pattern, original);
            hasChange = true;
          }
        }
        if (hasChange) {
          node.textContent = text;
        }
      }
    }
  }

  // 开始监控指定元素
  public startMonitoring(element: HTMLElement, id: string): void {
    // 先停掉旧监控，避免同 id 重复安装导致资源泄漏
    this.stopMonitoring(id);
    this.takeSnapshot(element, id);

    // 设置 MutationObserver
    const observer = new MutationObserver((mutations) => {
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

    observer.observe(element, {
      childList: true,
      subtree: true,
      attributes: true,
      characterData: true
    });

    // 设置定期检查
    const interval = window.setInterval(() => {
      if (!this.verifyElement(element, id)) {
        console.warn(`定期检查发现 DOM 元素 ${id} 被篡改，正在恢复...`);
        this.restoreElement(element, id);
      }
    }, 2000);

    this.monitors.set(id, { observer, interval });
  }

  // 停止监控（可指定 id；不传则全部停止）
  public stopMonitoring(id?: string): void {
    if (id) {
      const monitor = this.monitors.get(id);
      if (monitor) {
        monitor.observer.disconnect();
        window.clearInterval(monitor.interval);
        this.monitors.delete(id);
      }
      return;
    }
    this.monitors.forEach((monitor) => {
      monitor.observer.disconnect();
      window.clearInterval(monitor.interval);
    });
    this.monitors.clear();
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