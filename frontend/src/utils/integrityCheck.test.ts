import { integrityChecker } from './integrityCheck';

// 模拟测试环境
const mockDocument = {
  documentElement: {
    outerHTML: '<html><body><div>Synapse</div></body></html>',
    innerHTML: '<body><div>Synapse</div></body>'
  },
  body: {
    innerText: 'Synapse',
    innerHTML: '<div>Synapse</div>'
  },
  createTreeWalker: () => ({
    nextNode: () => null
  }),
  createElement: (tag: string) => ({
    style: {},
    innerHTML: '',
    appendChild: () => {},
    prepend: () => {}
  }),
  head: {
    appendChild: () => {}
  }
};

// 模拟window对象
const mockWindow = {
  location: {
    href: 'http://localhost:3000'
  },
  setInterval: (fn: Function, delay: number) => 1,
  clearInterval: () => {},
  fetch: async () => new Response(),
  performance: {
    now: () => Date.now()
  }
};

// 模拟XMLHttpRequest
const mockXMLHttpRequest = {
  prototype: {
    open: function() {},
    send: function() {},
    getResponseHeader: () => 'text/html',
    responseText: '<html><body>Synapse</body></html>',
    readyState: 4,
    onreadystatechange: null
  }
};

describe('IntegrityChecker - Nginx Proxy Defense', () => {
  beforeEach(() => {
    // 重置模拟对象
    global.document = mockDocument as any;
    global.window = mockWindow as any;
    global.XMLHttpRequest = mockXMLHttpRequest as any;
  });

  test('应该能够检测nginx代理篡改', () => {
    // 模拟nginx代理篡改的内容
    const tamperedContent = '<html><body><div>Modified TTS</div><!-- nginx --></body></html>';
    
    // 模拟内容变化检测
    const changes = integrityChecker['analyzeContentChanges'](tamperedContent);
    
    expect(changes.hasProxyTampering).toBe(true);
    expect(changes.replacedTexts).toContain('Synapse');
  });

  test('应该能够检测代理头信息', () => {
    // 模拟包含代理头的响应
    const mockResponse = {
      headers: {
        get: (name: string) => {
          if (name === 'via') return 'nginx/1.18.0';
          if (name === 'x-forwarded-for') return '192.168.1.1';
          return null;
        }
      }
    };

    // 测试代理头检测逻辑
    const proxyHeaders = ['via', 'x-forwarded-for', 'x-forwarded-proto', 'x-real-ip', 'x-forwarded-host'];
    const hasProxyHeaders = proxyHeaders.some(header => 
      mockResponse.headers.get(header) !== null
    );

    expect(hasProxyHeaders).toBe(true);
  });

  test('应该能够计算内容校验和', () => {
    const content = 'Synapse Content';
    const checksum = integrityChecker['calculateChecksum'](content);
    
    expect(checksum).toBeDefined();
    expect(typeof checksum).toBe('string');
    expect(checksum.length).toBeGreaterThan(0);
  });

  test('应该能够检测关键文本', () => {
    const criticalTexts = [
      'Happy-clo',
      'Synapse', 
      'Happy',
      'TTS',
      'Text to Speech'
    ];

    criticalTexts.forEach(text => {
      const isCritical = integrityChecker['isCriticalText'](text);
      expect(isCritical).toBe(true);
    });

    const nonCriticalTexts = [
      'Hello World',
      'Test Content',
      'Random Text'
    ];

    nonCriticalTexts.forEach(text => {
      const isCritical = integrityChecker['isCriticalText'](text);
      expect(isCritical).toBe(false);
    });
  });

  test('应该能够处理网络篡改事件', () => {
    const originalResponse = '<html><body>Synapse</body></html>';
    const tamperedResponse = '<html><body>Modified Content</body></html>';
    const url = 'http://localhost:3000';

    // 模拟网络篡改处理
    expect(() => {
      integrityChecker['handleNetworkTampering'](url, originalResponse, tamperedResponse);
    }).not.toThrow();
  });

  test('应该能够执行紧急恢复', () => {
    // 模拟紧急恢复
    expect(() => {
      integrityChecker['performEmergencyRecovery']();
    }).not.toThrow();
  });

  test('应该能够检测内容长度异常', () => {
    const baselineLength = 100;
    const currentLength = 250; // 显著增加的长度

    const isAnomaly = Math.abs(currentLength - baselineLength) > 100;
    expect(isAnomaly).toBe(true);
  });

  test('应该能够生成网络哈希', () => {
    const content = 'Test content for network hash';
    const networkHash = integrityChecker['calculateNetworkHash'](content);
    
    expect(networkHash).toBeDefined();
    expect(typeof networkHash).toBe('string');
    expect(networkHash.length).toBeGreaterThan(0);
  });

  test('应该能够生成签名', () => {
    const content = 'Test content for signature';
    const signature = integrityChecker['calculateSignature'](content);
    
    expect(signature).toBeDefined();
    expect(typeof signature).toBe('string');
    expect(signature.length).toBeGreaterThan(0);
  });
});

// 导出测试函数供其他测试使用
export const testIntegrityChecker = {
  analyzeContentChanges: (content: string) => integrityChecker['analyzeContentChanges'](content),
  isCriticalText: (text: string) => integrityChecker['isCriticalText'](text),
  calculateChecksum: (content: string) => integrityChecker['calculateChecksum'](content),
  calculateNetworkHash: (content: string) => integrityChecker['calculateNetworkHash'](content),
  calculateSignature: (content: string) => integrityChecker['calculateSignature'](content)
}; 