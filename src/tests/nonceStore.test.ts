import { NonceStore } from '../services/nonceStore';

describe('NonceStore', () => {
  let store: NonceStore;

  beforeEach(() => {
    store = new NonceStore({
      maxSize: 100,
      cleanupInterval: 1000,
      ttlMs: 5000 // 5 seconds for testing
    });
  });

  afterEach(() => {
    store.destroy();
  });

  describe('store and retrieve', () => {
    it('should store and retrieve nonce records', () => {
      const nonceId = 'test-nonce-123';
      const clientIp = '127.0.0.1';
      const userAgent = 'test-agent';

      store.storeNonce(nonceId, clientIp, userAgent);

      const record = store.get(nonceId);
      expect(record).toBeDefined();
      expect(record?.id).toBe(nonceId);
      expect(record?.clientIp).toBe(clientIp);
      expect(record?.userAgent).toBe(userAgent);
      expect(record?.issuedAt).toBeDefined();
      expect(record?.consumedAt).toBeUndefined();
    });

    it('should check if nonce exists', () => {
      const nonceId = 'test-nonce-456';
      
      expect(store.exists(nonceId)).toBe(false);
      
      store.storeNonce(nonceId);
      expect(store.exists(nonceId)).toBe(true);
    });
  });

  describe('consume', () => {
    it('should successfully consume a valid nonce', () => {
      const nonceId = 'test-nonce-789';
      store.storeNonce(nonceId);

      const result = store.consume(nonceId);
      
      expect(result.success).toBe(true);
      expect(result.record).toBeDefined();
      expect(result.record?.consumedAt).toBeDefined();
    });

    it('should fail to consume non-existent nonce', () => {
      const result = store.consume('non-existent-nonce');
      
      expect(result.success).toBe(false);
      expect(result.reason).toBe('nonce_not_found');
    });

    it('should fail to consume already consumed nonce', () => {
      const nonceId = 'test-nonce-consumed';
      store.storeNonce(nonceId);

      // First consumption should succeed
      const firstResult = store.consume(nonceId);
      expect(firstResult.success).toBe(true);

      // Second consumption should fail
      const secondResult = store.consume(nonceId);
      expect(secondResult.success).toBe(false);
      expect(secondResult.reason).toBe('nonce_already_consumed');
    });

    it('should fail to consume expired nonce', (done) => {
      const nonceId = 'test-nonce-expired';
      store.storeNonce(nonceId);

      // Wait for nonce to expire
      setTimeout(() => {
        const result = store.consume(nonceId);
        expect(result.success).toBe(false);
        expect(result.reason).toBe('nonce_not_found');
        done();
      }, 6000); // Wait longer than TTL
    }, 7000);
  });

  describe('cleanup', () => {
    it('should clean up expired nonces', (done) => {
      const nonceId1 = 'test-nonce-cleanup-1';
      const nonceId2 = 'test-nonce-cleanup-2';
      
      store.storeNonce(nonceId1);
      store.storeNonce(nonceId2);

      expect(store.exists(nonceId1)).toBe(true);
      expect(store.exists(nonceId2)).toBe(true);

      // Wait for nonces to expire
      setTimeout(() => {
        const cleanedCount = store.cleanup();
        expect(cleanedCount).toBeGreaterThanOrEqual(0);
        expect(store.exists(nonceId1)).toBe(false);
        expect(store.exists(nonceId2)).toBe(false);
        done();
      }, 6000);
    }, 7000);

    it('should not clean up valid nonces', () => {
      const nonceId = 'test-nonce-valid';
      store.storeNonce(nonceId);

      const cleanedCount = store.cleanup();
      expect(cleanedCount).toBe(0);
      expect(store.exists(nonceId)).toBe(true);
    });
  });

  describe('stats', () => {
    it('should return correct statistics', () => {
      const nonceId1 = 'test-nonce-stats-1';
      const nonceId2 = 'test-nonce-stats-2';
      const nonceId3 = 'test-nonce-stats-3';

      store.storeNonce(nonceId1);
      store.storeNonce(nonceId2);
      store.storeNonce(nonceId3);

      // Consume one nonce
      store.consume(nonceId1);

      const stats = store.getStats();
      expect(stats.totalCount).toBe(3);
      expect(stats.consumedCount).toBe(1);
      expect(stats.activeCount).toBe(2);
      expect(stats.expiredCount).toBe(0);
    });
  });

  describe('size limits', () => {
    it('should respect maximum size limit', () => {
      const smallStore = new NonceStore({ maxSize: 2, ttlMs: 60000 });

      smallStore.storeNonce('nonce-1');
      smallStore.storeNonce('nonce-2');
      smallStore.storeNonce('nonce-3'); // Should evict oldest

      const stats = smallStore.getStats();
      expect(stats.totalCount).toBe(2);

      smallStore.destroy();
    });
  });
});