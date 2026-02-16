import crypto from 'crypto';
import logger from '../utils/logger';

/**
 * 验证令牌类型
 */
export enum VerificationTokenType {
    EMAIL_REGISTRATION = 'email_registration',  // 邮箱注册验证
    PASSWORD_RESET = 'password_reset'           // 密码重置验证
}

/**
 * 验证令牌接口
 */
export interface VerificationToken {
    token: string;                      // 唯一验证令牌
    type: VerificationTokenType;        // 令牌类型
    email: string;                      // 关联的邮箱
    fingerprint: string;                // 设备指纹
    ipAddress: string;                  // IP地址
    metadata?: any;                     // 额外数据（如注册信息、用户ID等）
    createdAt: number;                  // 创建时间戳
    expiresAt: number;                  // 过期时间戳
    used: boolean;                      // 是否已使用
    usedAt?: number;                    // 使用时间戳
}

/**
 * 验证令牌存储
 * 使用内存Map存储，实际生产环境建议使用Redis
 */
class VerificationTokenStorage {
    private tokens: Map<string, VerificationToken> = new Map();
    private cleanupInterval: NodeJS.Timeout | null = null;
    private readonly TOKEN_EXPIRY_MS = 10 * 60 * 1000; // 10分钟有效期

    constructor() {
        // 启动定期清理过期令牌的任务
        this.startCleanupTask();
    }

    /**
     * 生成安全的随机令牌
     */
    private generateToken(): string {
        return crypto.randomBytes(32).toString('hex');
    }

    /**
     * 创建验证令牌
     */
    createToken(
        type: VerificationTokenType,
        email: string,
        fingerprint: string,
        ipAddress: string,
        metadata?: any
    ): VerificationToken {
        const token = this.generateToken();
        const now = Date.now();

        const verificationToken: VerificationToken = {
            token,
            type,
            email,
            fingerprint,
            ipAddress,
            metadata,
            createdAt: now,
            expiresAt: now + this.TOKEN_EXPIRY_MS,
            used: false
        };

        this.tokens.set(token, verificationToken);
        
        return verificationToken;
    }

    /**
     * 获取验证令牌
     */
    getToken(token: string): VerificationToken | null {
        const verificationToken = this.tokens.get(token);
        
        if (!verificationToken) {
            return null;
        }

        // 检查是否过期
        if (Date.now() > verificationToken.expiresAt) {
            this.tokens.delete(token);
            logger.warn(`[验证令牌] 已过期`);
            return null;
        }

        return verificationToken;
    }

    /**
     * 验证并使用令牌
     * @param token 令牌
     * @param fingerprint 当前设备指纹
     * @param ipAddress 当前IP地址
     * @returns 验证结果和令牌数据
     */
    verifyAndUseToken(
        token: string,
        fingerprint: string,
        ipAddress: string
    ): { success: boolean; error?: string; data?: VerificationToken } {
        const verificationToken = this.getToken(token);

        if (!verificationToken) {
            return { success: false, error: '验证链接无效或已过期' };
        }

        if (verificationToken.used) {
            return { success: false, error: '验证链接已被使用' };
        }

        // 校验设备指纹
        if (verificationToken.fingerprint !== fingerprint) {
            logger.warn(`[验证令牌] 设备指纹不匹配`);
            return { success: false, error: '设备指纹验证失败，请使用相同设备打开链接' };
        }

        // 校验IP地址
        if (verificationToken.ipAddress !== ipAddress) {
            logger.warn(`[验证令牌] IP地址不匹配`);
            return { success: false, error: 'IP地址验证失败，请使用相同网络打开链接' };
        }

        // 标记为已使用
        verificationToken.used = true;
        verificationToken.usedAt = Date.now();
        this.tokens.set(token, verificationToken);

        logger.info(`[验证令牌] 验证成功`);

        return { success: true, data: verificationToken };
    }

    /**
     * 删除令牌
     */
    deleteToken(token: string): void {
        this.tokens.delete(token);
        logger.info(`[验证令牌] 已删除`);
    }

    /**
     * 清理过期令牌
     */
    private cleanupExpiredTokens(): void {
        const now = Date.now();
        let deletedCount = 0;

        for (const [token, verificationToken] of this.tokens.entries()) {
            if (now > verificationToken.expiresAt) {
                this.tokens.delete(token);
                deletedCount++;
            }
        }

        if (deletedCount > 0) {
            logger.info(`[验证令牌] 清理过期令牌: ${deletedCount}个`);
        }
    }

    /**
     * 启动定期清理任务
     */
    private startCleanupTask(): void {
        // 每5分钟清理一次过期令牌
        this.cleanupInterval = setInterval(() => {
            this.cleanupExpiredTokens();
        }, 5 * 60 * 1000);

        logger.info('[验证令牌] 清理任务已启动');
    }

    /**
     * 停止清理任务
     */
    stopCleanupTask(): void {
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
            this.cleanupInterval = null;
            logger.info('[验证令牌] 清理任务已停止');
        }
    }

    /**
     * 获取统计信息
     */
    getStats(): { total: number; expired: number; used: number; active: number } {
        const now = Date.now();
        let expired = 0;
        let used = 0;
        let active = 0;

        for (const verificationToken of this.tokens.values()) {
            if (now > verificationToken.expiresAt) {
                expired++;
            } else if (verificationToken.used) {
                used++;
            } else {
                active++;
            }
        }

        return {
            total: this.tokens.size,
            expired,
            used,
            active
        };
    }
}

// 导出单例
export const verificationTokenStorage = new VerificationTokenStorage();
