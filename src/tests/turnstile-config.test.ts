import { CloudflareTurnstileService } from '../services/cloudflareTurnstileService';

// 清除模块缓存
beforeEach(() => {
  jest.resetModules();
});

describe('人机验证配置测试', () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    // 保存原始环境变量
    originalEnv = { ...process.env };
  });

  afterEach(() => {
    // 恢复原始环境变量
    process.env = originalEnv;
    // 清除所有 mock
    jest.clearAllMocks();
    jest.resetModules();
  });

  describe('enableTurnstile 配置', () => {
    it('当 VITE_ENABLE_TURNSTILE 未设置时应该默认为 false', () => {
      // 确保环境变量未设置
      delete process.env.VITE_ENABLE_TURNSTILE;
      
      // 清除模块缓存并重新导入配置以获取最新值
      jest.resetModules();
      const { enableTurnstile: freshEnableTurnstile } = require('../config');
      
      expect(freshEnableTurnstile).toBe(false);
    });

    it('当 VITE_ENABLE_TURNSTILE 设置为 "false" 时应该为 false', () => {
      process.env.VITE_ENABLE_TURNSTILE = 'false';
      
      // 清除模块缓存并重新导入
      jest.resetModules();
      const { enableTurnstile: freshEnableTurnstile } = require('../config');
      
      expect(freshEnableTurnstile).toBe(false);
    });

    it('当 VITE_ENABLE_TURNSTILE 设置为 "true" 时应该为 true', () => {
      process.env.VITE_ENABLE_TURNSTILE = 'true';
      
      // 清除模块缓存并重新导入
      jest.resetModules();
      const { enableTurnstile: freshEnableTurnstile } = require('../config');
      
      expect(freshEnableTurnstile).toBe(true);
    });

    it('当 VITE_ENABLE_TURNSTILE 设置为其他值时应该为 false', () => {
      process.env.VITE_ENABLE_TURNSTILE = 'enabled';
      
      // 清除模块缓存并重新导入
      jest.resetModules();
      const { enableTurnstile: freshEnableTurnstile } = require('../config');
      
      expect(freshEnableTurnstile).toBe(false);
    });
  });

  describe('CloudflareTurnstileService.isEnabled() 方法', () => {
    it('当 enableTurnstile 为 false 时应该返回 false', () => {
      // 模拟 enableTurnstile 为 false 的情况
      jest.doMock('../config', () => ({
        enableTurnstile: false
      }));

      // 清除模块缓存并重新导入
      jest.resetModules();
      const { CloudflareTurnstileService: FreshService } = require('../services/cloudflareTurnstileService');
      
      expect(FreshService.isEnabled()).toBe(false);
    });

    it('当密钥未配置时应该返回 false', () => {
      // 模拟 enableTurnstile 为 true 但没有密钥的情况
      jest.doMock('../config', () => ({
        enableTurnstile: true
      }));

      jest.doMock('../config/config', () => ({
        config: {
          cloudflareTurnstile: {
            secretKey: '',
            siteKey: ''
          }
        }
      }));

      // 清除模块缓存并重新导入
      jest.resetModules();
      const { CloudflareTurnstileService: FreshService } = require('../services/cloudflareTurnstileService');
      
      expect(FreshService.isEnabled()).toBe(false);
    });

    it('当 enableTurnstile 和密钥都已配置时应该返回 true', () => {
      // 模拟完整配置的情况
      jest.doMock('../config', () => ({
        enableTurnstile: true
      }));

      jest.doMock('../config/config', () => ({
        config: {
          cloudflareTurnstile: {
            secretKey: 'test-secret-key',
            siteKey: 'test-site-key'
          }
        }
      }));

      // 清除模块缓存并重新导入
      jest.resetModules();
      const { CloudflareTurnstileService: FreshService } = require('../services/cloudflareTurnstileService');
      
      expect(FreshService.isEnabled()).toBe(true);
    });
  });

  describe('CloudflareTurnstileService.verifyToken() 方法', () => {
    it('当 enableTurnstile 为 false 时，无论 token 如何都应该返回 true', async () => {
      // 模拟 enableTurnstile 为 false 的情况
      jest.doMock('../config', () => ({
        enableTurnstile: false
      }));

      // 清除模块缓存并重新导入
      jest.resetModules();
      const { CloudflareTurnstileService: FreshService } = require('../services/cloudflareTurnstileService');
      
      // 测试空 token
      const result1 = await FreshService.verifyToken('', '127.0.0.1');
      expect(result1).toBe(true);

      // 测试有效 token
      const result2 = await FreshService.verifyToken('valid-token', '127.0.0.1');
      expect(result2).toBe(true);

      // 测试无效 token
      const result3 = await FreshService.verifyToken('invalid-token', '127.0.0.1');
      expect(result3).toBe(true);
    });

    it('当密钥未配置时，无论 token 如何都应该返回 true', async () => {
      // 模拟 enableTurnstile 为 true 但没有密钥的情况
      jest.doMock('../config', () => ({
        enableTurnstile: true
      }));

      jest.doMock('../config/config', () => ({
        config: {
          cloudflareTurnstile: {
            secretKey: '',
            siteKey: ''
          }
        }
      }));

      // 清除模块缓存并重新导入
      jest.resetModules();
      const { CloudflareTurnstileService: FreshService } = require('../services/cloudflareTurnstileService');
      
      // 测试空 token
      const result1 = await FreshService.verifyToken('', '127.0.0.1');
      expect(result1).toBe(true);

      // 测试有效 token
      const result2 = await FreshService.verifyToken('valid-token', '127.0.0.1');
      expect(result2).toBe(true);
    });

    it('当 token 为空且服务配置正确时应该返回 false', async () => {
      // 模拟完整配置的情况
      jest.doMock('../config', () => ({
        enableTurnstile: true
      }));

      jest.doMock('../config/config', () => ({
        config: {
          cloudflareTurnstile: {
            secretKey: 'test-secret-key',
            siteKey: 'test-site-key'
          }
        }
      }));

      // 清除模块缓存并重新导入
      jest.resetModules();
      const { CloudflareTurnstileService: FreshService } = require('../services/cloudflareTurnstileService');
      
      const result = await FreshService.verifyToken('', '127.0.0.1');
      expect(result).toBe(false);
    });
  });

  describe('集成测试: TTS 控制器行为', () => {
    it('当人机验证被禁用时不应该要求 cfToken', async () => {
      // 模拟 turnstile 被禁用的情况
      jest.doMock('../config', () => ({
        enableTurnstile: false
      }));

      jest.doMock('../config/config', () => ({
        config: {
          cloudflareTurnstile: {
            secretKey: '',
            siteKey: ''
          }
        }
      }));

      // 清除模块缓存并重新导入
      jest.resetModules();
      
      const { CloudflareTurnstileService: FreshService } = require('../services/cloudflareTurnstileService');
      
      // 验证服务被禁用
      expect(FreshService.isEnabled()).toBe(false);
      
      // 验证空 token 也能通过
      const result = await FreshService.verifyToken('', '127.0.0.1');
      expect(result).toBe(true);
    });

    it('当人机验证被启用时应该要求 cfToken', async () => {
      // 模拟 turnstile 被启用的情况
      jest.doMock('../config', () => ({
        enableTurnstile: true
      }));

      jest.doMock('../config/config', () => ({
        config: {
          cloudflareTurnstile: {
            secretKey: 'test-secret-key',
            siteKey: 'test-site-key'
          }
        }
      }));

      // 清除模块缓存并重新导入
      jest.resetModules();
      
      const { CloudflareTurnstileService: FreshService } = require('../services/cloudflareTurnstileService');
      
      // 验证服务被启用
      expect(FreshService.isEnabled()).toBe(true);
      
      // 验证空 token 会被拒绝
      const result = await FreshService.verifyToken('', '127.0.0.1');
      expect(result).toBe(false);
    });
  });
}); 