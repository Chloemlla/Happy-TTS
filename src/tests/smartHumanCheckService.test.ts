import { SmartHumanCheckService } from '../services/smartHumanCheckService';
import crypto from 'crypto';

describe('SmartHumanCheckService', () => {
  let service: SmartHumanCheckService;

  beforeEach(() => {
    service = new SmartHumanCheckService({
      secret: 'test-secret-key',
      ttlMs: 5 * 60 * 1000, // 5 minutes
      maxSkewMs: 2 * 60 * 1000, // 2 minutes
      scoreThreshold: 0.62
    });
  });

  describe('issueNonce', () => {
    it('should generate a valid nonce successfully', () => {
      const result = service.issueNonce('127.0.0.1', 'test-agent');
      
      expect(result.success).toBe(true);
      expect(result.nonce).toBeDefined();
      expect(typeof result.nonce).toBe('string');
      expect(result.timestamp).toBeDefined();
      expect(result.error).toBeUndefined();
    });

    it('should return structured error response on failure', () => {
      // Mock crypto.randomBytes to throw an error
      const originalRandomBytes = crypto.randomBytes;
      crypto.randomBytes = jest.fn().mockImplementation(() => {
        throw new Error('Crypto error');
      });

      const result = service.issueNonce();
      
      expect(result.success).toBe(false);
      expect(result.error).toBe('服务器内部错误');
      expect(result.errorCode).toBe('SERVER_ERROR');
      expect(result.errorMessage).toBe('服务器内部错误');
      expect(result.retryable).toBe(true);
      expect(result.timestamp).toBeDefined();

      // Restore original function
      crypto.randomBytes = originalRandomBytes;
    });
  });

  describe('verifyToken', () => {
    it('should return structured error for missing token', () => {
      const result = service.verifyToken('');
      
      expect(result.success).toBe(false);
      expect(result.reason).toBe('missing_token');
      expect(result.errorCode).toBe('MISSING_TOKEN');
      expect(result.errorMessage).toBe('缺少验证令牌');
      expect(result.retryable).toBe(false);
      expect(result.timestamp).toBeDefined();
    });

    it('should return structured error for bad token format', () => {
      const result = service.verifyToken('invalid-base64');
      
      expect(result.success).toBe(false);
      expect(result.reason).toBe('bad_token_format');
      expect(result.errorCode).toBe('BAD_TOKEN_FORMAT');
      expect(result.errorMessage).toBe('验证令牌格式错误');
      expect(result.retryable).toBe(false);
      expect(result.timestamp).toBeDefined();
    });

    it('should return structured error for incomplete token', () => {
      const incompleteToken = Buffer.from(JSON.stringify({ payload: null })).toString('base64');
      const result = service.verifyToken(incompleteToken);
      
      expect(result.success).toBe(false);
      expect(result.reason).toBe('incomplete_token');
      expect(result.errorCode).toBe('INCOMPLETE_TOKEN');
      expect(result.errorMessage).toBe('验证令牌数据不完整');
      expect(result.retryable).toBe(false);
      expect(result.timestamp).toBeDefined();
    });

    it('should return structured error for expired nonce', () => {
      // Create a valid nonce first
      const nonceResult = service.issueNonce('127.0.0.1', 'test-agent');
      expect(nonceResult.success).toBe(true);
      
      // Create a token with expired timestamp
      const expiredPayload = {
        v: 1,
        ts: Date.now() - 10 * 60 * 1000, // 10 minutes ago
        tz: 'UTC',
        ua: 'test-agent',
        ce: 'test-entropy',
        sc: 0.8,
        st: {},
        cn: nonceResult.nonce
      };
      
      const payloadStr = JSON.stringify(expiredPayload);
      const salt = crypto.randomBytes(12).toString('base64');
      const sig = crypto.createHash('sha256').update(`${payloadStr}|${salt}`).digest('base64');
      
      const token = Buffer.from(JSON.stringify({
        payload: expiredPayload,
        salt,
        sig
      })).toString('base64');
      
      const result = service.verifyToken(token);
      
      expect(result.success).toBe(false);
      expect(result.reason).toBe('client_time_skew');
      expect(result.errorCode).toBe('CLIENT_TIME_SKEW');
      expect(result.errorMessage).toBe('客户端时间偏差过大');
      expect(result.retryable).toBe(true);
      expect(result.timestamp).toBeDefined();
    });

    it('should return structured error for low score', () => {
      // Create a valid nonce first
      const nonceResult = service.issueNonce('127.0.0.1', 'test-agent');
      expect(nonceResult.success).toBe(true);
      
      // Create a token with low score
      const lowScorePayload = {
        v: 1,
        ts: Date.now(),
        tz: 'UTC',
        ua: 'test-agent',
        ce: 'test-entropy',
        sc: 0.3, // Below threshold
        st: {},
        cn: nonceResult.nonce
      };
      
      const payloadStr = JSON.stringify(lowScorePayload);
      const salt = crypto.randomBytes(12).toString('base64');
      const sig = crypto.createHash('sha256').update(`${payloadStr}|${salt}`).digest('base64');
      
      const token = Buffer.from(JSON.stringify({
        payload: lowScorePayload,
        salt,
        sig
      })).toString('base64');
      
      const result = service.verifyToken(token);
      
      expect(result.success).toBe(false);
      expect(result.reason).toBe('low_score');
      expect(result.errorCode).toBe('LOW_SCORE');
      expect(result.errorMessage).toBe('行为评分过低');
      expect(result.retryable).toBe(false);
      expect(result.score).toBe(0.3);
      expect(result.timestamp).toBeDefined();
    });

    it('should successfully verify valid token', () => {
      // Create a valid nonce first
      const nonceResult = service.issueNonce('127.0.0.1', 'test-agent');
      expect(nonceResult.success).toBe(true);
      
      // Create a valid token
      const validPayload = {
        v: 1,
        ts: Date.now(),
        tz: 'UTC',
        ua: 'test-agent',
        ce: 'test-entropy',
        sc: 0.8, // Above threshold
        st: {},
        cn: nonceResult.nonce
      };
      
      const payloadStr = JSON.stringify(validPayload);
      const salt = crypto.randomBytes(12).toString('base64');
      const sig = crypto.createHash('sha256').update(`${payloadStr}|${salt}`).digest('base64');
      
      const token = Buffer.from(JSON.stringify({
        payload: validPayload,
        salt,
        sig
      })).toString('base64');
      
      const result = service.verifyToken(token, '127.0.0.1');
      
      expect(result.success).toBe(true);
      expect(result.score).toBe(0.8);
      expect(result.tokenOk).toBe(true);
      expect(result.nonceOk).toBe(true);
      expect(result.timestamp).toBeDefined();
    });
  });
});