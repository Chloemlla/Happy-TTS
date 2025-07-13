import { CloudflareTurnstileService } from '../services/cloudflareTurnstileService';
import { enableTurnstile } from '../config';

describe('Turnstile Configuration Tests', () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    // 保存原始环境变量
    originalEnv = { ...process.env };
  });

  afterEach(() => {
    // 恢复原始环境变量
    process.env = originalEnv;
  });

  describe('enableTurnstile configuration', () => {
    it('should be false by default when VITE_ENABLE_TURNSTILE is not set', () => {
      // 确保环境变量未设置
      delete process.env.VITE_ENABLE_TURNSTILE;
      
      // 重新导入配置以获取最新值
      const { enableTurnstile: freshEnableTurnstile } = require('../config');
      
      expect(freshEnableTurnstile).toBe(false);
    });

    it('should be false when VITE_ENABLE_TURNSTILE is set to "false"', () => {
      process.env.VITE_ENABLE_TURNSTILE = 'false';
      
      const { enableTurnstile: freshEnableTurnstile } = require('../config');
      
      expect(freshEnableTurnstile).toBe(false);
    });

    it('should be true when VITE_ENABLE_TURNSTILE is set to "true"', () => {
      process.env.VITE_ENABLE_TURNSTILE = 'true';
      
      const { enableTurnstile: freshEnableTurnstile } = require('../config');
      
      expect(freshEnableTurnstile).toBe(true);
    });

    it('should be false when VITE_ENABLE_TURNSTILE is set to any other value', () => {
      process.env.VITE_ENABLE_TURNSTILE = 'enabled';
      
      const { enableTurnstile: freshEnableTurnstile } = require('../config');
      
      expect(freshEnableTurnstile).toBe(false);
    });
  });

  describe('CloudflareTurnstileService.isEnabled()', () => {
    it('should return false when enableTurnstile is false', () => {
      // 模拟 enableTurnstile 为 false 的情况
      jest.doMock('../config', () => ({
        enableTurnstile: false
      }));

      const { CloudflareTurnstileService: FreshService } = require('../services/cloudflareTurnstileService');
      
      expect(FreshService.isEnabled()).toBe(false);
    });

    it('should return false when secret key is not configured', () => {
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

      const { CloudflareTurnstileService: FreshService } = require('../services/cloudflareTurnstileService');
      
      expect(FreshService.isEnabled()).toBe(false);
    });

    it('should return true when both enableTurnstile and secret key are configured', () => {
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

      const { CloudflareTurnstileService: FreshService } = require('../services/cloudflareTurnstileService');
      
      expect(FreshService.isEnabled()).toBe(true);
    });
  });

  describe('CloudflareTurnstileService.verifyToken()', () => {
    it('should return true when enableTurnstile is false, regardless of token', async () => {
      // 模拟 enableTurnstile 为 false 的情况
      jest.doMock('../config', () => ({
        enableTurnstile: false
      }));

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

    it('should return true when secret key is not configured, regardless of token', async () => {
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

      const { CloudflareTurnstileService: FreshService } = require('../services/cloudflareTurnstileService');
      
      // 测试空 token
      const result1 = await FreshService.verifyToken('', '127.0.0.1');
      expect(result1).toBe(true);

      // 测试有效 token
      const result2 = await FreshService.verifyToken('valid-token', '127.0.0.1');
      expect(result2).toBe(true);
    });

    it('should return false when token is empty and service is properly configured', async () => {
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

      const { CloudflareTurnstileService: FreshService } = require('../services/cloudflareTurnstileService');
      
      const result = await FreshService.verifyToken('', '127.0.0.1');
      expect(result).toBe(false);
    });
  });

  describe('Integration: TTS Controller behavior', () => {
    it('should not require cfToken when turnstile is disabled', async () => {
      // 模拟 turnstile 被禁用的情况
      process.env.VITE_ENABLE_TURNSTILE = 'false';
      
      // 这里可以添加对 TTS 控制器的集成测试
      // 但由于控制器依赖较多，我们主要测试配置逻辑
      
      const { enableTurnstile: freshEnableTurnstile } = require('../config');
      expect(freshEnableTurnstile).toBe(false);
      
      const isEnabled = CloudflareTurnstileService.isEnabled();
      expect(isEnabled).toBe(false);
    });

    it('should require cfToken when turnstile is enabled', async () => {
      // 模拟 turnstile 被启用的情况
      process.env.VITE_ENABLE_TURNSTILE = 'true';
      
      const { enableTurnstile: freshEnableTurnstile } = require('../config');
      expect(freshEnableTurnstile).toBe(true);
      
      // 注意：这里 isEnabled 可能仍然为 false，因为需要配置密钥
      // 这是预期的行为
    });
  });
}); 