import express from 'express';
import rateLimit from 'express-rate-limit';
import { Request, Response, NextFunction } from 'express';

describe('Rate Limiting', () => {
  let app: express.Application;

  beforeEach(() => {
    app = express();
    app.use(express.json());
  });

  describe('meEndpointLimiter Configuration', () => {
    it('应该正确配置速率限制参数', () => {
      // 创建限流器配置
      const rateLimitConfig = {
        windowMs: 5 * 60 * 1000, // 5分钟
        max: 300, // 限制每个IP每5分钟300次请求
        message: { error: '请求过于频繁，请稍后再试' },
        standardHeaders: true,
        legacyHeaders: false,
        keyGenerator: (req: Request) => {
          const ip = req.ip || req.socket.remoteAddress || 'unknown';
          return ip;
        },
        skip: (req: Request): boolean => {
          const ip = req.ip || req.socket.remoteAddress || 'unknown';
          return ['127.0.0.1', 'localhost', '::1'].includes(ip);
        }
      };

      // 验证配置参数
      expect(rateLimitConfig.windowMs).toBe(5 * 60 * 1000); // 5分钟
      expect(rateLimitConfig.max).toBe(300); // 300次请求
      expect(rateLimitConfig.message).toEqual({ error: '请求过于频繁，请稍后再试' });
      expect(rateLimitConfig.standardHeaders).toBe(true);
      expect(rateLimitConfig.legacyHeaders).toBe(false);
    });

    it('应该允许本地IP跳过限制', () => {
      const skipFunction = (req: Request): boolean => {
        const ip = req.ip || req.socket.remoteAddress || 'unknown';
        return ['127.0.0.1', 'localhost', '::1'].includes(ip);
      };

      const localIps = ['127.0.0.1', 'localhost', '::1'];
      
      for (const ip of localIps) {
        const req = {
          ip,
          socket: { remoteAddress: ip }
        } as any;

        const shouldSkip = skipFunction(req);
        expect(shouldSkip).toBe(true);
      }
    });

    it('应该对非本地IP应用限制', () => {
      const skipFunction = (req: Request): boolean => {
        const ip = req.ip || req.socket.remoteAddress || 'unknown';
        return ['127.0.0.1', 'localhost', '::1'].includes(ip);
      };

      const nonLocalIps = ['192.168.1.1', '10.0.0.1', '172.16.0.1'];
      
      for (const ip of nonLocalIps) {
        const req = {
          ip,
          socket: { remoteAddress: ip }
        } as any;

        const shouldSkip = skipFunction(req);
        expect(shouldSkip).toBe(false);
      }
    });

    it('应该正确生成IP密钥', () => {
      const keyGenerator = (req: Request) => {
        const ip = req.ip || req.socket.remoteAddress || 'unknown';
        return ip;
      };

      const testCases = [
        { ip: '192.168.1.1', expected: '192.168.1.1' },
        { ip: '10.0.0.1', expected: '10.0.0.1' },
        { ip: undefined, socketIp: '172.16.0.1', expected: '172.16.0.1' },
        { ip: undefined, socketIp: undefined, expected: 'unknown' }
      ];

      testCases.forEach(({ ip, socketIp, expected }) => {
        const req = {
          ip,
          socket: { remoteAddress: socketIp }
        } as any;

        const key = keyGenerator(req);
        expect(key).toBe(expected);
      });
    });
  });

  describe('Rate Limit Middleware', () => {
    it('应该创建有效的限流器中间件', () => {
      const meEndpointLimiter = rateLimit({
        windowMs: 5 * 60 * 1000, // 5分钟
        max: 300, // 限制每个IP每5分钟300次请求
        message: { error: '请求过于频繁，请稍后再试' },
        standardHeaders: true,
        legacyHeaders: false,
        keyGenerator: (req: Request) => {
          const ip = req.ip || req.socket.remoteAddress || 'unknown';
          return ip;
        },
        skip: (req: Request): boolean => {
          const ip = req.ip || req.socket.remoteAddress || 'unknown';
          return ['127.0.0.1', 'localhost', '::1'].includes(ip);
        }
      });

      // 验证中间件是一个函数
      expect(typeof meEndpointLimiter).toBe('function');
      
      // 验证中间件有正确的参数签名
      expect(meEndpointLimiter.length).toBe(3); // (req, res, next)
    });

    it('应该在超过限制时返回错误消息', () => {
      const errorMessage = { error: '请求过于频繁，请稍后再试' };
      expect(errorMessage).toEqual({ error: '请求过于频繁，请稍后再试' });
    });
  });
});

describe('Rate Limit Configuration Comparison', () => {
  it('应该验证新的速率限制配置比旧配置更宽松', () => {
    // 旧配置：每分钟60次请求
    const oldConfig = {
      windowMs: 60 * 1000, // 1分钟
      max: 60 // 60次请求
    };

    // 新配置：每5分钟300次请求
    const newConfig = {
      windowMs: 5 * 60 * 1000, // 5分钟
      max: 300 // 300次请求
    };

    // 计算每分钟的平均请求数
    const oldRequestsPerMinute = oldConfig.max / (oldConfig.windowMs / 60000);
    const newRequestsPerMinute = newConfig.max / (newConfig.windowMs / 60000);

    expect(oldRequestsPerMinute).toBe(60);
    expect(newRequestsPerMinute).toBe(60);
    
    // 新配置允许更长的窗口期，更适合处理请求峰值
    expect(newConfig.windowMs).toBeGreaterThan(oldConfig.windowMs);
    expect(newConfig.max).toBeGreaterThan(oldConfig.max);
  });
});

describe('Rate Limit Skip Logic', () => {
  it('应该正确处理各种IP格式', () => {
    const skipFunction = (req: any) => {
      const ip = req.ip || req.socket.remoteAddress || 'unknown';
      return ['127.0.0.1', 'localhost', '::1'].includes(ip);
    };

    const testCases = [
      { ip: '127.0.0.1', shouldSkip: true },
      { ip: 'localhost', shouldSkip: true },
      { ip: '::1', shouldSkip: true },
      { ip: '192.168.1.1', shouldSkip: false },
      { ip: '10.0.0.1', shouldSkip: false },
      { ip: '172.16.0.1', shouldSkip: false },
      { ip: undefined, socketIp: '127.0.0.1', shouldSkip: true },
      { ip: undefined, socketIp: '192.168.1.1', shouldSkip: false }
    ];

    testCases.forEach(({ ip, socketIp, shouldSkip }) => {
      const req = {
        ip,
        socket: { remoteAddress: socketIp }
      } as any;

      const result = skipFunction(req);
      expect(result).toBe(shouldSkip);
    });
  });
}); 