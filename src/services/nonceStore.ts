import logger from '../utils/logger';

/**
 * NonceStore - 管理 nonce 的生命周期和消费状态
 * 
 * 功能：
 * - 存储已发放的 nonce
 * - 跟踪 nonce 的消费状态
 * - 自动清理过期的 nonce
 * - 防止 nonce 重复使用
 */

export interface NonceRecord {
    id: string;           // nonce 唯一标识
    issuedAt: number;     // 发放时间戳
    consumedAt?: number;  // 消费时间戳
    clientIp?: string;    // 客户端 IP
    userAgent?: string;   // 用户代理
}

export interface NonceStoreConfig {
    maxSize?: number;     // 最大存储数量
    cleanupInterval?: number; // 清理间隔（毫秒）
    ttlMs?: number;       // nonce 有效期
}

export class NonceStore {
    private store = new Map<string, NonceRecord>();
    private cleanupTimer?: NodeJS.Timeout;
    private readonly maxSize: number;
    private readonly cleanupInterval: number;
    private readonly ttlMs: number;

    constructor(config: NonceStoreConfig = {}) {
        this.maxSize = config.maxSize || 10000;
        this.cleanupInterval = config.cleanupInterval || 60 * 1000; // 1 minute
        this.ttlMs = config.ttlMs || 5 * 60 * 1000; // 5 minutes

        this.startCleanupTimer();
    }

    /**
     * 存储新发放的 nonce
     */
    storeNonce(nonceId: string, clientIp?: string, userAgent?: string): void {
        if (!nonceId || typeof nonceId !== 'string') {
            throw new Error('Invalid nonce ID provided');
        }

        // 如果存储已满，先清理过期项
        if (this.store.size >= this.maxSize) {
            this.cleanup();

            // 如果清理后仍然满了，删除最旧的项
            if (this.store.size >= this.maxSize) {
                const oldestKey = this.store.keys().next().value;
                if (oldestKey) {
                    this.store.delete(oldestKey);
                    logger.debug('[NonceStore] Evicted oldest nonce due to size limit', {
                        evictedNonceId: oldestKey.slice(0, 8) + '...',
                        maxSize: this.maxSize
                    });
                }
            }
        }

        const record: NonceRecord = {
            id: nonceId,
            issuedAt: Date.now(),
            clientIp,
            userAgent
        };

        this.store.set(nonceId, record);

        logger.debug('[NonceStore] Stored nonce', {
            nonceId: nonceId.slice(0, 8) + '...',
            clientIp,
            storeSize: this.store.size
        });
    }

    /**
     * 消费 nonce（标记为已使用）
     */
    consume(nonceId: string): { success: boolean; reason?: string; record?: NonceRecord } {
        if (!nonceId || typeof nonceId !== 'string') {
            return { success: false, reason: 'invalid_nonce_id' };
        }

        const record = this.store.get(nonceId);

        if (!record) {
            return { success: false, reason: 'nonce_not_found' };
        }

        // 检查是否已过期
        const now = Date.now();
        if (now - record.issuedAt > this.ttlMs) {
            this.store.delete(nonceId);
            logger.debug('[NonceStore] Removed expired nonce during consumption', {
                nonceId: nonceId.slice(0, 8) + '...',
                age: now - record.issuedAt
            });
            return { success: false, reason: 'nonce_expired' };
        }

        // 检查是否已被消费
        if (record.consumedAt) {
            logger.warn('[NonceStore] Attempted to reuse consumed nonce', {
                nonceId: nonceId.slice(0, 8) + '...',
                originalConsumedAt: record.consumedAt,
                clientIp: record.clientIp
            });
            return { success: false, reason: 'nonce_already_consumed', record };
        }

        // 标记为已消费
        record.consumedAt = now;
        this.store.set(nonceId, record);

        logger.debug('[NonceStore] Consumed nonce', {
            nonceId: nonceId.slice(0, 8) + '...',
            issuedAt: record.issuedAt,
            consumedAt: record.consumedAt,
            clientIp: record.clientIp
        });

        return { success: true, record };
    }

    /**
     * 检查 nonce 是否存在且有效
     */
    exists(nonceId: string): boolean {
        const record = this.store.get(nonceId);
        if (!record) return false;

        const now = Date.now();
        return now - record.issuedAt <= this.ttlMs;
    }

    /**
     * 获取 nonce 记录
     */
    get(nonceId: string): NonceRecord | undefined {
        return this.store.get(nonceId);
    }

    /**
     * 清理过期的 nonce
     */
    cleanup(): number {
        const now = Date.now();
        let cleanedCount = 0;

        for (const [nonceId, record] of this.store.entries()) {
            if (now - record.issuedAt > this.ttlMs) {
                this.store.delete(nonceId);
                cleanedCount++;
            }
        }

        if (cleanedCount > 0) {
            logger.debug('[NonceStore] Cleaned up expired nonces', {
                cleanedCount,
                remainingCount: this.store.size
            });
        }

        return cleanedCount;
    }

    /**
     * 获取存储统计信息
     */
    getStats(): {
        totalCount: number;
        consumedCount: number;
        activeCount: number;
        expiredCount: number;
        oldestNonceAge?: number;
        newestNonceAge?: number;
        averageAge?: number;
    } {
        const now = Date.now();
        let consumedCount = 0;
        let activeCount = 0;
        let expiredCount = 0;
        let oldestAge = 0;
        let newestAge = Number.MAX_SAFE_INTEGER;
        let totalAge = 0;

        for (const record of this.store.values()) {
            const age = now - record.issuedAt;
            totalAge += age;

            if (age > oldestAge) oldestAge = age;
            if (age < newestAge) newestAge = age;

            if (now - record.issuedAt > this.ttlMs) {
                expiredCount++;
            } else if (record.consumedAt) {
                consumedCount++;
            } else {
                activeCount++;
            }
        }

        const result: any = {
            totalCount: this.store.size,
            consumedCount,
            activeCount,
            expiredCount
        };

        if (this.store.size > 0) {
            result.oldestNonceAge = oldestAge;
            result.newestNonceAge = newestAge === Number.MAX_SAFE_INTEGER ? 0 : newestAge;
            result.averageAge = Math.round(totalAge / this.store.size);
        }

        return result;
    }

    /**
     * 启动定时清理
     */
    private startCleanupTimer(): void {
        this.cleanupTimer = setInterval(() => {
            this.cleanup();
        }, this.cleanupInterval);
    }

    /**
     * 健康检查
     */
    healthCheck(): {
        healthy: boolean;
        issues: string[];
        stats: ReturnType<NonceStore['getStats']>;
    } {
        const stats = this.getStats();
        const issues: string[] = [];

        // 检查存储使用率
        const usageRatio = stats.totalCount / this.maxSize;
        if (usageRatio > 0.9) {
            issues.push(`Storage usage high: ${Math.round(usageRatio * 100)}%`);
        }

        // 检查过期项比例
        if (stats.totalCount > 0) {
            const expiredRatio = stats.expiredCount / stats.totalCount;
            if (expiredRatio > 0.3) {
                issues.push(`High expired nonce ratio: ${Math.round(expiredRatio * 100)}%`);
            }
        }

        // 检查清理定时器
        if (!this.cleanupTimer) {
            issues.push('Cleanup timer not running');
        }

        return {
            healthy: issues.length === 0,
            issues,
            stats
        };
    }

    /**
     * 停止定时清理
     */
    destroy(): void {
        if (this.cleanupTimer) {
            clearInterval(this.cleanupTimer);
            this.cleanupTimer = undefined;
        }
        this.store.clear();
        logger.debug('[NonceStore] Destroyed store and cleanup timer');
    }
}

// 单例实例
let nonceStoreInstance: NonceStore | null = null;

export function getNonceStore(config?: NonceStoreConfig): NonceStore {
    if (!nonceStoreInstance) {
        nonceStoreInstance = new NonceStore(config);
    }
    return nonceStoreInstance;
}

export function destroyNonceStore(): void {
    if (nonceStoreInstance) {
        nonceStoreInstance.destroy();
        nonceStoreInstance = null;
    }
}