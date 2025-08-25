import express from 'express';
import rateLimit from 'express-rate-limit';
import { TurnstileService } from '../services/turnstileService';
import { authenticateToken } from '../middleware/authenticateToken';
import { schedulerService } from '../services/schedulerService';

const router = express.Router();

// 创建不同类型的速率限制器
// 公共接口限流器（无需认证的接口）
const publicLimiter = rateLimit({
    windowMs: 60 * 1000, // 1分钟
    max: 30, // 每分钟30次请求
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: '请求过于频繁，请稍后再试' },
    keyGenerator: (req) => req.ip || req.socket.remoteAddress || 'unknown',
    handler: (req, res) => {
        res.status(429).json({
            error: '请求过于频繁，请稍后再试',
            retryAfter: 60
        });
    }
});

// 指纹验证接口限流器（更严格）
const fingerprintLimiter = rateLimit({
    windowMs: 60 * 1000, // 1分钟
    max: 20, // 每分钟20次请求
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: '指纹验证请求过于频繁，请稍后再试' },
    keyGenerator: (req) => req.ip || req.socket.remoteAddress || 'unknown',
    handler: (req, res) => {
        res.status(429).json({
            error: '指纹验证请求过于频繁，请稍后再试',
            retryAfter: 60
        });
    }
});

// 管理员接口限流器
const adminLimiter = rateLimit({
    windowMs: 60 * 1000, // 1分钟
    max: 50, // 每分钟50次请求
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: '管理员操作过于频繁，请稍后再试' },
    keyGenerator: (req) => req.ip || req.socket.remoteAddress || 'unknown',
    handler: (req, res) => {
        res.status(429).json({
            error: '管理员操作过于频繁，请稍后再试',
            retryAfter: 60
        });
    }
});

// 配置管理接口限流器（更严格）
const configLimiter = rateLimit({
    windowMs: 5 * 60 * 1000, // 5分钟
    max: 10, // 每5分钟10次请求
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: '配置操作过于频繁，请稍后再试' },
    keyGenerator: (req) => req.ip || req.socket.remoteAddress || 'unknown',
    handler: (req, res) => {
        res.status(429).json({
            error: '配置操作过于频繁，请稍后再试',
            retryAfter: 300
        });
    }
});

// 临时指纹上报接口（无需认证）
router.post('/temp-fingerprint', publicLimiter, async (req, res) => {
    try {
        const { fingerprint } = req.body;
        const clientIp = req.ip || req.socket.remoteAddress || (Array.isArray(req.headers['x-forwarded-for']) ? req.headers['x-forwarded-for'][0] : req.headers['x-forwarded-for']) || 'unknown';
        const validatedClientIp = typeof clientIp === 'string' ? clientIp : 'unknown';
        
        if (!fingerprint || typeof fingerprint !== 'string') {
            return res.status(400).json({ 
                success: false, 
                error: '指纹参数无效' 
            });
        }

        // 检查IP是否被封禁
        const banStatus = await TurnstileService.isIpBanned(validatedClientIp);
        if (banStatus.banned) {
            return res.status(403).json({
                success: false,
                error: 'IP已被封禁',
                reason: banStatus.reason,
                expiresAt: banStatus.expiresAt
            });
        }

        const result = await TurnstileService.reportTempFingerprint(fingerprint, validatedClientIp);

        res.json({
            success: true,
            isFirstVisit: result.isFirstVisit,
            verified: result.verified
        });
    } catch (error) {
        console.error('临时指纹上报失败:', error);
        res.status(500).json({ 
            success: false, 
            error: '服务器内部错误' 
        });
    }
});

// 验证临时指纹接口（无需认证）
router.post('/verify-temp-fingerprint', fingerprintLimiter, async (req, res) => {
    try {
        const { fingerprint, cfToken } = req.body;
        const clientIp = req.ip || req.socket.remoteAddress || (Array.isArray(req.headers['x-forwarded-for']) ? req.headers['x-forwarded-for'][0] : req.headers['x-forwarded-for']) || 'unknown';
        const validatedClientIp = typeof clientIp === 'string' ? clientIp : 'unknown';
        
        if (!fingerprint || typeof fingerprint !== 'string') {
            return res.status(400).json({ 
                success: false, 
                error: '指纹参数无效' 
            });
        }

        if (!cfToken || typeof cfToken !== 'string') {
            return res.status(400).json({ 
                success: false, 
                error: '验证令牌无效' 
            });
        }

        // 检查IP是否被封禁
        const banStatus = await TurnstileService.isIpBanned(validatedClientIp);
        if (banStatus.banned) {
            return res.status(403).json({
                success: false,
                error: 'IP已被封禁',
                reason: banStatus.reason,
                expiresAt: banStatus.expiresAt
            });
        }

        const result = await TurnstileService.verifyTempFingerprint(fingerprint, cfToken, validatedClientIp);

        if (!result.success) {
            return res.status(400).json({ 
                success: false, 
                error: '验证失败' 
            });
        }

        res.json({
            success: true,
            verified: true,
            accessToken: result.accessToken
        });
    } catch (error) {
        console.error('验证临时指纹失败:', error);
        res.status(500).json({ 
            success: false, 
            error: '服务器内部错误' 
        });
    }
});

// 验证访问密钥接口（无需认证）
router.post('/verify-access-token', fingerprintLimiter, async (req, res) => {
    try {
        const { token, fingerprint } = req.body;
        const clientIp = req.ip || req.socket.remoteAddress || (Array.isArray(req.headers['x-forwarded-for']) ? req.headers['x-forwarded-for'][0] : req.headers['x-forwarded-for']) || 'unknown';
        const validatedClientIp = typeof clientIp === 'string' ? clientIp : 'unknown';
        
        if (!token || typeof token !== 'string') {
            return res.status(400).json({ 
                success: false, 
                error: '访问密钥无效' 
            });
        }

        if (!fingerprint || typeof fingerprint !== 'string') {
            return res.status(400).json({ 
                success: false, 
                error: '指纹参数无效' 
            });
        }

        // 检查IP是否被封禁
        const banStatus = await TurnstileService.isIpBanned(clientIp);
        if (banStatus.banned) {
            return res.status(403).json({
                success: false,
                error: 'IP已被封禁',
                reason: banStatus.reason,
                expiresAt: banStatus.expiresAt
            });
        }

        const isValid = await TurnstileService.verifyAccessToken(token, fingerprint, clientIp);

        if (!isValid) {
            return res.status(400).json({ 
                success: false, 
                error: '访问密钥无效或已过期' 
            });
        }

        res.json({
            success: true,
            valid: true
        });
    } catch (error) {
        console.error('验证访问密钥失败:', error);
        res.status(500).json({ 
            success: false, 
            error: '服务器内部错误' 
        });
    }
});

// 检查指纹是否有有效访问密钥接口（无需认证）
router.get('/check-access-token/:fingerprint', fingerprintLimiter, async (req, res) => {
    try {
        const { fingerprint } = req.params;
        const clientIp = req.ip || req.socket.remoteAddress || req.headers['x-forwarded-for'] || 'unknown';
        const validatedClientIp = typeof clientIp === 'string' ? clientIp : 'unknown';
        
        if (!fingerprint) {
            return res.status(400).json({ 
                success: false, 
                error: '指纹参数无效' 
            });
        }

        // 检查IP是否被封禁
        const banStatus = await TurnstileService.isIpBanned(validatedClientIp);
        if (banStatus.banned) {
            return res.status(403).json({
                success: false,
                error: 'IP已被封禁',
                reason: banStatus.reason,
                expiresAt: banStatus.expiresAt
            });
        }

        const hasValidToken = await TurnstileService.hasValidAccessToken(fingerprint, validatedClientIp);

        res.json({
            success: true,
            hasValidToken
        });
    } catch (error) {
        console.error('检查访问密钥失败:', error);
        res.status(500).json({ 
            success: false, 
            error: '服务器内部错误' 
        });
    }
});

// 检查临时指纹状态接口（无需认证）
router.get('/temp-fingerprint/:fingerprint', fingerprintLimiter, async (req, res) => {
    try {
        const { fingerprint } = req.params;
        const clientIp = req.ip || req.socket.remoteAddress || req.headers['x-forwarded-for'] || 'unknown';
        const validatedClientIp = typeof clientIp === 'string' ? clientIp : 'unknown';
        
        if (!fingerprint) {
            return res.status(400).json({ 
                success: false, 
                error: '指纹参数无效' 
            });
        }

        // 检查IP是否被封禁
        const banStatus = await TurnstileService.isIpBanned(validatedClientIp);
        if (banStatus.banned) {
            return res.status(403).json({
                success: false,
                error: 'IP已被封禁',
                reason: banStatus.reason,
                expiresAt: banStatus.expiresAt
            });
        }

        const status = await TurnstileService.checkTempFingerprintStatus(fingerprint);

        res.json({
            success: true,
            exists: status.exists,
            verified: status.verified
        });
    } catch (error) {
        console.error('检查临时指纹状态失败:', error);
        res.status(500).json({ 
            success: false, 
            error: '服务器内部错误' 
        });
    }
});

// 清理过期指纹接口（管理员专用）
router.post('/cleanup-expired-fingerprints', authenticateToken, adminLimiter, async (req, res) => {
    try {
        const userRole = (req as any).user?.role;
        const isAdmin = userRole === 'admin' || userRole === 'administrator';
        
        if (!isAdmin) {
            return res.status(403).json({ 
                success: false, 
                error: '权限不足' 
            });
        }

        const deletedCount = await TurnstileService.cleanupExpiredFingerprints();

        res.json({
            success: true,
            deletedCount,
            message: `清理了 ${deletedCount} 条过期指纹记录`
        });
    } catch (error) {
        console.error('清理过期指纹失败:', error);
        res.status(500).json({ 
            success: false, 
            error: '服务器内部错误' 
        });
    }
});

// 获取指纹统计信息接口（管理员专用）
router.get('/fingerprint-stats', authenticateToken, adminLimiter, async (req, res) => {
    try {
        const userRole = (req as any).user?.role;
        const isAdmin = userRole === 'admin' || userRole === 'administrator';
        
        if (!isAdmin) {
            return res.status(403).json({ 
                success: false, 
                error: '权限不足' 
            });
        }

        const stats = await TurnstileService.getTempFingerprintStats();

        res.json({
            success: true,
            stats
        });
    } catch (error) {
        console.error('获取指纹统计失败:', error);
        res.status(500).json({ 
            success: false, 
            error: '服务器内部错误' 
        });
    }
});

// 获取IP封禁统计信息接口（管理员专用）
router.get('/ip-ban-stats', authenticateToken, adminLimiter, async (req, res) => {
    try {
        const userRole = (req as any).user?.role;
        const isAdmin = userRole === 'admin' || userRole === 'administrator';
        
        if (!isAdmin) {
            return res.status(403).json({ 
                success: false, 
                error: '权限不足' 
            });
        }

        const stats = await TurnstileService.getIpBanStats();

        res.json({
            success: true,
            stats
        });
    } catch (error) {
        console.error('获取IP封禁统计失败:', error);
        res.status(500).json({ 
            success: false, 
            error: '服务器内部错误' 
        });
    }
});

// 手动封禁IP接口（管理员专用）
router.post('/ban-ip', authenticateToken, adminLimiter, async (req, res) => {
    try {
        const userRole = (req as any).user?.role;
        const isAdmin = userRole === 'admin' || userRole === 'administrator';
        
        if (!isAdmin) {
            return res.status(403).json({ 
                success: false, 
                error: '权限不足' 
            });
        }

        const { ipAddress, reason, durationMinutes, fingerprint, userAgent } = req.body;
        
        if (!ipAddress || typeof ipAddress !== 'string') {
            return res.status(400).json({ 
                success: false, 
                error: 'IP地址参数无效' 
            });
        }

        if (!reason || typeof reason !== 'string') {
            return res.status(400).json({ 
                success: false, 
                error: '封禁原因参数无效' 
            });
        }

        // 验证IP地址格式
        const ipRegex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
        if (!ipRegex.test(ipAddress)) {
            return res.status(400).json({ 
                success: false, 
                error: 'IP地址格式无效' 
            });
        }

        // 验证和设置封禁时长
        let banDuration = 60; // 默认60分钟
        
        if (durationMinutes !== undefined && durationMinutes !== null) {
            // 确保是数字类型
            const duration = Number(durationMinutes);
            
            // 检查是否为有效数字
            if (isNaN(duration) || !isFinite(duration)) {
                return res.status(400).json({ 
                    success: false, 
                    error: '封禁时长必须是有效的数字' 
                });
            }
            
            // 设置合理的范围：1分钟到24小时（1440分钟）
            banDuration = Math.min(
                Math.max(duration, 1), // 最少1分钟
                24 * 60 // 最多24小时
            );
        }

        // 检查IP是否已经被封禁
        const existingBan = await TurnstileService.isIpBanned(ipAddress);
        if (existingBan.banned) {
            return res.status(409).json({ 
                success: false, 
                error: 'IP已被封禁',
                existingBan: {
                    reason: existingBan.reason,
                    expiresAt: existingBan.expiresAt
                }
            });
        }

        // 手动封禁IP
        const banResult = await TurnstileService.manualBanIp(
            ipAddress, 
            reason, 
            banDuration,
            fingerprint,
            userAgent
        );
        
        if (banResult.success) {
            res.json({ 
                success: true, 
                message: `IP ${ipAddress} 已被封禁 ${banDuration} 分钟`,
                banInfo: {
                    ipAddress,
                    reason,
                    durationMinutes: banDuration,
                    expiresAt: banResult.expiresAt,
                    bannedAt: banResult.bannedAt
                }
            });
        } else {
            res.status(500).json({ 
                success: false, 
                error: banResult.error || '封禁失败' 
            });
        }
    } catch (error) {
        console.error('手动封禁IP失败:', error);
        res.status(500).json({ 
            success: false, 
            error: '服务器内部错误' 
        });
    }
});

// 手动解除IP封禁接口（管理员专用）
router.post('/unban-ip', authenticateToken, adminLimiter, async (req, res) => {
    try {
        const userRole = (req as any).user?.role;
        const isAdmin = userRole === 'admin' || userRole === 'administrator';
        
        if (!isAdmin) {
            return res.status(403).json({ 
                success: false, 
                error: '权限不足' 
            });
        }

        const { ipAddress } = req.body;
        
        if (!ipAddress || typeof ipAddress !== 'string') {
            return res.status(400).json({ 
                success: false, 
                error: 'IP地址参数无效' 
            });
        }

        // 验证IP地址格式
        const ipRegex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
        if (!ipRegex.test(ipAddress)) {
            return res.status(400).json({ 
                success: false, 
                error: 'IP地址格式无效' 
            });
        }

        const success = await TurnstileService.unbanIp(ipAddress);
        
        if (success) {
            res.json({ 
                success: true, 
                message: `IP ${ipAddress} 封禁已解除` 
            });
        } else {
            res.status(404).json({ 
                success: false, 
                error: 'IP地址未找到或未被封禁' 
            });
        }
    } catch (error) {
        console.error('解除IP封禁失败:', error);
        res.status(500).json({ 
            success: false, 
            error: '服务器内部错误' 
        });
    }
});

// 批量封禁IP接口（管理员专用）
router.post('/ban-ips', authenticateToken, adminLimiter, async (req, res) => {
    try {
        const userRole = (req as any).user?.role;
        const isAdmin = userRole === 'admin' || userRole === 'administrator';
        
        if (!isAdmin) {
            return res.status(403).json({ 
                success: false, 
                error: '权限不足' 
            });
        }

        const { ipAddresses, reason, durationMinutes } = req.body;
        
        if (!Array.isArray(ipAddresses) || ipAddresses.length === 0) {
            return res.status(400).json({ 
                success: false, 
                error: 'IP地址列表参数无效' 
            });
        }

        if (!reason || typeof reason !== 'string') {
            return res.status(400).json({ 
                success: false, 
                error: '封禁原因参数无效' 
            });
        }

        // 验证IP地址格式
        const ipRegex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
        const invalidIPs = ipAddresses.filter(ip => !ipRegex.test(ip));
        if (invalidIPs.length > 0) {
            return res.status(400).json({ 
                success: false, 
                error: '以下IP地址格式无效',
                invalidIPs
            });
        }

        // 验证和设置封禁时长
        let banDuration = 60; // 默认60分钟
        
        if (durationMinutes !== undefined && durationMinutes !== null) {
            // 确保是数字类型
            const duration = Number(durationMinutes);
            
            // 检查是否为有效数字
            if (isNaN(duration) || !isFinite(duration)) {
                return res.status(400).json({ 
                    success: false, 
                    error: '封禁时长必须是有效的数字' 
                });
            }
            
            // 设置合理的范围：1分钟到24小时（1440分钟）
            banDuration = Math.min(
                Math.max(duration, 1), // 最少1分钟
                24 * 60 // 最多24小时
            );
        }

        const results = [];
        const errors = [];

        for (const ipAddress of ipAddresses) {
            try {
                // 检查IP是否已经被封禁
                const existingBan = await TurnstileService.isIpBanned(ipAddress);
                if (existingBan.banned) {
                    errors.push({
                        ipAddress,
                        error: 'IP已被封禁',
                        existingBan: {
                            reason: existingBan.reason,
                            expiresAt: existingBan.expiresAt
                        }
                    });
                    continue;
                }

                // 手动封禁IP
                const banResult = await TurnstileService.manualBanIp(
                    ipAddress, 
                    reason, 
                    banDuration
                );
                
                if (banResult.success) {
                    results.push({
                        ipAddress,
                        success: true,
                        message: `IP ${ipAddress} 已被封禁 ${banDuration} 分钟`,
                        banInfo: {
                            reason,
                            durationMinutes: banDuration,
                            expiresAt: banResult.expiresAt,
                            bannedAt: banResult.bannedAt
                        }
                    });
                } else {
                    errors.push({
                        ipAddress,
                        error: banResult.error || '封禁失败'
                    });
                }
            } catch (error) {
                errors.push({
                    ipAddress,
                    error: error instanceof Error ? error.message : '未知错误'
                });
            }
        }

        res.json({
            success: true,
            total: ipAddresses.length,
            successful: results.length,
            failed: errors.length,
            results,
            errors
        });
    } catch (error) {
        console.error('批量封禁IP失败:', error);
        res.status(500).json({ 
            success: false, 
            error: '服务器内部错误' 
        });
    }
});

// 批量解封IP接口（管理员专用）
router.post('/unban-ips', authenticateToken, adminLimiter, async (req, res) => {
    try {
        const userRole = (req as any).user?.role;
        const isAdmin = userRole === 'admin' || userRole === 'administrator';
        
        if (!isAdmin) {
            return res.status(403).json({ 
                success: false, 
                error: '权限不足' 
            });
        }

        const { ipAddresses } = req.body;
        
        if (!Array.isArray(ipAddresses) || ipAddresses.length === 0) {
            return res.status(400).json({ 
                success: false, 
                error: 'IP地址列表参数无效' 
            });
        }

        // 验证IP地址格式
        const ipRegex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
        const invalidIPs = ipAddresses.filter(ip => !ipRegex.test(ip));
        if (invalidIPs.length > 0) {
            return res.status(400).json({ 
                success: false, 
                error: '以下IP地址格式无效',
                invalidIPs
            });
        }

        const results = [];
        const errors = [];

        for (const ipAddress of ipAddresses) {
            try {
                const success = await TurnstileService.unbanIp(ipAddress);
                
                if (success) {
                    results.push({
                        ipAddress,
                        success: true,
                        message: `IP ${ipAddress} 封禁已解除`
                    });
                } else {
                    errors.push({
                        ipAddress,
                        error: 'IP地址未找到或未被封禁'
                    });
                }
            } catch (error) {
                errors.push({
                    ipAddress,
                    error: error instanceof Error ? error.message : '未知错误'
                });
            }
        }

        res.json({
            success: true,
            total: ipAddresses.length,
            successful: results.length,
            failed: errors.length,
            results,
            errors
        });
    } catch (error) {
        console.error('批量解封IP失败:', error);
        res.status(500).json({ 
            success: false, 
            error: '服务器内部错误' 
        });
    }
});

// 获取定时任务状态接口（管理员专用）
router.get('/scheduler-status', authenticateToken, adminLimiter, async (req, res) => {
    try {
        const userRole = (req as any).user?.role;
        const isAdmin = userRole === 'admin' || userRole === 'administrator';
        
        if (!isAdmin) {
            return res.status(403).json({ 
                success: false, 
                error: '权限不足' 
            });
        }

        const status = schedulerService.getStatus();

        res.json({
            success: true,
            status
        });
    } catch (error) {
        console.error('获取定时任务状态失败:', error);
        res.status(500).json({ 
            success: false, 
            error: '服务器内部错误' 
        });
    }
});

// 手动触发清理接口（管理员专用）
router.post('/manual-cleanup', authenticateToken, adminLimiter, async (req, res) => {
    try {
        const userRole = (req as any).user?.role;
        const isAdmin = userRole === 'admin' || userRole === 'administrator';
        
        if (!isAdmin) {
            return res.status(403).json({ 
                success: false, 
                error: '权限不足' 
            });
        }

        const result = await schedulerService.manualCleanup();

        res.json({
            success: result.success,
            deletedCount: result.deletedCount,
            message: result.success 
                ? `手动清理完成，删除了 ${result.deletedCount} 条过期记录`
                : `手动清理失败: ${result.error}`,
            error: result.error
        });
    } catch (error) {
        console.error('手动清理失败:', error);
        res.status(500).json({ 
            success: false, 
            error: '服务器内部错误' 
        });
    }
});

// 启动定时任务接口（管理员专用）
router.post('/scheduler/start', authenticateToken, adminLimiter, async (req, res) => {
    try {
        const userRole = (req as any).user?.role;
        const isAdmin = userRole === 'admin' || userRole === 'administrator';
        
        if (!isAdmin) {
            return res.status(403).json({ 
                success: false, 
                error: '权限不足' 
            });
        }

        schedulerService.start();

        res.json({
            success: true,
            message: '定时任务已启动'
        });
    } catch (error) {
        console.error('启动定时任务失败:', error);
        res.status(500).json({ 
            success: false, 
            error: '服务器内部错误' 
        });
    }
});

// 停止定时任务接口（管理员专用）
router.post('/scheduler/stop', authenticateToken, adminLimiter, async (req, res) => {
    try {
        const userRole = (req as any).user?.role;
        const isAdmin = userRole === 'admin' || userRole === 'administrator';
        
        if (!isAdmin) {
            return res.status(403).json({ 
                success: false, 
                error: '权限不足' 
            });
        }

        schedulerService.stop();

        res.json({
            success: true,
            message: '定时任务已停止'
        });
    } catch (error) {
        console.error('停止定时任务失败:', error);
        res.status(500).json({ 
            success: false, 
            error: '服务器内部错误' 
        });
    }
});

/**
 * @openapi
 * /api/turnstile/config:
 *   get:
 *     summary: 获取Turnstile配置
 *     description: 获取当前Turnstile配置信息（需要认证）
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Turnstile配置信息
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 enabled:
 *                   type: boolean
 *                   description: 是否启用
 *                 siteKey:
 *                   type: string
 *                   description: 站点密钥
 *                 secretKey:
 *                   type: string
 *                   description: 密钥（仅管理员可见）
 *       401:
 *         description: 未授权
 */
router.get('/config', authenticateToken, configLimiter, async (req, res) => {
    try {
        const config = await TurnstileService.getConfig();
        
        // 非管理员用户不返回secretKey
        const userRole = (req as any).user?.role;
        const isAdmin = userRole === 'admin' || userRole === 'administrator';
        
        // 对Secret Key进行脱敏处理
        const maskedSecretKey = config.secretKey && config.secretKey.length > 8 
            ? (config.secretKey.slice(0, 2) + '***' + config.secretKey.slice(-4)) 
            : (config.secretKey ? '***' : null);
        
        res.json({
            enabled: config.enabled,
            siteKey: config.siteKey,
            ...(isAdmin && { secretKey: maskedSecretKey })
        });
    } catch (error) {
        console.error('获取Turnstile配置失败:', error);
        res.status(500).json({
            error: '获取配置失败'
        });
    }
});

/**
 * @openapi
 * /api/turnstile/public-config:
 *   get:
 *     summary: 获取Turnstile公共配置
 *     description: 获取Turnstile公共配置信息（无需认证，用于首次访问验证）
 *     responses:
 *       200:
 *         description: 获取成功
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 enabled:
 *                   type: boolean
 *                   description: 是否启用
 *                 siteKey:
 *                   type: string
 *                   description: 站点密钥
 *       500:
 *         description: 服务器内部错误
 */
router.get('/public-config', publicLimiter, async (req, res) => {
    try {
        const config = await TurnstileService.getConfig();
        
        // 只返回前端需要的公共信息
        res.json({
            enabled: config.enabled,
            siteKey: config.siteKey
        });
    } catch (error) {
        console.error('获取Turnstile公共配置失败:', error);
        res.status(500).json({
            error: '获取配置失败'
        });
    }
});

/**
 * @openapi
 * /api/turnstile/config:
 *   post:
 *     summary: 更新Turnstile配置
 *     description: 更新Turnstile配置信息（需要管理员权限）
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - key
 *               - value
 *             properties:
 *               key:
 *                 type: string
 *                 enum: [TURNSTILE_SECRET_KEY, TURNSTILE_SITE_KEY]
 *                 description: 配置键名
 *               value:
 *                 type: string
 *                 description: 配置值
 *     responses:
 *       200:
 *         description: 更新成功
 *       401:
 *         description: 未授权
 *       403:
 *         description: 权限不足
 */
router.post('/config', authenticateToken, configLimiter, async (req, res) => {
    try {
        const userRole = (req as any).user?.role;
        const isAdmin = userRole === 'admin' || userRole === 'administrator';
        
        if (!isAdmin) {
            return res.status(403).json({ 
                success: false, 
                error: '权限不足' 
            });
        }

        const { key, value } = req.body;
        
        if (!key || !value || !['TURNSTILE_SECRET_KEY', 'TURNSTILE_SITE_KEY'].includes(key)) {
            return res.status(400).json({ 
                success: false, 
                error: '参数无效' 
            });
        }

        const success = await TurnstileService.updateConfig(key as 'TURNSTILE_SECRET_KEY' | 'TURNSTILE_SITE_KEY', value);
        
        if (success) {
            res.json({ 
                success: true, 
                message: '配置更新成功' 
            });
        } else {
            res.status(500).json({ 
                success: false, 
                error: '配置更新失败' 
            });
        }
    } catch (error) {
        console.error('更新Turnstile配置失败:', error);
        res.status(500).json({ 
            success: false, 
            error: '服务器内部错误' 
        });
    }
});

/**
 * @openapi
 * /api/turnstile/config/{key}:
 *   delete:
 *     summary: 删除Turnstile配置
 *     description: 删除指定的Turnstile配置（需要管理员权限）
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: key
 *         required: true
 *         schema:
 *           type: string
 *           enum: [TURNSTILE_SECRET_KEY, TURNSTILE_SITE_KEY]
 *         description: 要删除的配置键名
 *     responses:
 *       200:
 *         description: 删除成功
 *       401:
 *         description: 未授权
 *       403:
 *         description: 权限不足
 */
router.delete('/config/:key', authenticateToken, configLimiter, async (req, res) => {
    try {
        const userRole = (req as any).user?.role;
        const isAdmin = userRole === 'admin' || userRole === 'administrator';
        
        if (!isAdmin) {
            return res.status(403).json({ 
                success: false, 
                error: '权限不足' 
            });
        }

        const { key } = req.params;
        
        if (!key || !['TURNSTILE_SECRET_KEY', 'TURNSTILE_SITE_KEY'].includes(key)) {
            return res.status(400).json({ 
                success: false, 
                error: '参数无效' 
            });
        }

        const success = await TurnstileService.deleteConfig(key as 'TURNSTILE_SECRET_KEY' | 'TURNSTILE_SITE_KEY');
        
        if (success) {
            res.json({ 
                success: true, 
                message: '配置删除成功' 
            });
        } else {
            res.status(500).json({ 
                success: false, 
                error: '配置删除失败' 
            });
        }
    } catch (error) {
        console.error('删除Turnstile配置失败:', error);
        res.status(500).json({ 
            success: false, 
            error: '服务器内部错误' 
        });
    }
});

export default router; 