import { Request, Response } from 'express';
import { UserStorage } from '../utils/userStorage';
import { TOTPService } from '../services/totpService';
import { TOTPDebugger } from '../utils/totpDebugger';
import logger from '../utils/logger';
import fs from 'fs';
import path from 'path';

// TOTP验证尝试次数限制
const TOTP_ATTEMPT_LIMIT = 5;
const TOTP_LOCKOUT_DURATION = 15 * 60 * 1000; // 15分钟

// 存储TOTP验证尝试记录
const totpAttempts = new Map<string, { count: number; lastAttempt: number; lockedUntil?: number }>();

export class TOTPController {
    /**
     * 检查TOTP验证尝试次数
     */
    private static checkTOTPAttempts(userId: string): { allowed: boolean; remainingAttempts: number; lockedUntil?: number } {
        const attempts = totpAttempts.get(userId);
        
        if (!attempts) {
            return { allowed: true, remainingAttempts: TOTP_ATTEMPT_LIMIT };
        }

        // 检查是否在锁定期间
        if (attempts.lockedUntil && Date.now() < attempts.lockedUntil) {
            return { 
                allowed: false, 
                remainingAttempts: 0, 
                lockedUntil: attempts.lockedUntil 
            };
        }

        // 如果锁定时间已过，重置尝试次数
        if (attempts.lockedUntil && Date.now() >= attempts.lockedUntil) {
            totpAttempts.delete(userId);
            return { allowed: true, remainingAttempts: TOTP_ATTEMPT_LIMIT };
        }

        const remainingAttempts = Math.max(0, TOTP_ATTEMPT_LIMIT - attempts.count);
        return { allowed: remainingAttempts > 0, remainingAttempts };
    }

    /**
     * 记录TOTP验证尝试
     */
    private static recordTOTPAttempt(userId: string, success: boolean): void {
        const attempts = totpAttempts.get(userId) || { count: 0, lastAttempt: 0 };
        
        if (success) {
            // 验证成功，重置尝试次数
            totpAttempts.delete(userId);
        } else {
            // 验证失败，增加尝试次数
            attempts.count += 1;
            attempts.lastAttempt = Date.now();
            
            // 如果达到限制，设置锁定时间
            if (attempts.count >= TOTP_ATTEMPT_LIMIT) {
                attempts.lockedUntil = Date.now() + TOTP_LOCKOUT_DURATION;
                logger.warn('TOTP验证尝试次数超限，账户被锁定:', { userId, lockoutDuration: TOTP_LOCKOUT_DURATION });
            }
            
            totpAttempts.set(userId, attempts);
        }
    }

    /**
     * 生成TOTP设置信息
     */
    public static async generateSetup(req: Request, res: Response) {
        try {
            // @ts-ignore
            const user = req.user as any;
            if (!user) {
                return res.status(401).json({ error: '未授权访问' });
            }

            const userId = user.id;

            // 如果已经启用了TOTP，返回错误
            if (user.totpEnabled) {
                return res.status(400).json({ error: 'TOTP已经启用' });
            }

            // 生成新的TOTP密钥
            const secret = TOTPService.generateSecret(user.username);
            
            // 生成otpauth URL和QR码
            const otpauthUrl = TOTPService.generateOTPAuthURL(secret, user.username);
            const qrCodeDataUrl = await TOTPService.generateQRCodeDataURL(secret, user.username);
            
            // 生成备用恢复码
            const backupCodes = TOTPService.generateBackupCodes();

            // 临时保存密钥到用户数据中（还未启用）
            await TOTPController.updateUserTOTP(userId, secret, false, backupCodes);

            logger.info('TOTP设置生成成功:', { userId, username: user.username });

            res.json({
                secret,
                otpauthUrl,
                qrCodeDataUrl,
                backupCodes,
                message: '请使用认证器应用扫描QR码，然后输入6位验证码完成设置'
            });
        } catch (error) {
            logger.error('生成TOTP设置失败:', error);
            res.status(500).json({ error: '生成TOTP设置失败' });
        }
    }

    /**
     * 验证并启用TOTP
     */
    public static async verifyAndEnable(req: Request, res: Response) {
        let currentUser: any = null;
        try {
            // @ts-ignore
            currentUser = req.user as any;
            if (!currentUser) {
                return res.status(401).json({ error: '未授权访问' });
            }

            const userId = currentUser.id;
            const { token } = req.body;

            if (!token) {
                logger.warn('verifyAndEnable: 未提供验证码', { userId, token, body: req.body });
                return res.status(400).json({ error: '请提供验证码' });
            }

            if (currentUser.totpEnabled) {
                logger.warn('verifyAndEnable: TOTP已经启用', { userId, username: currentUser.username });
                return res.status(400).json({ error: 'TOTP已经启用' });
            }

            if (!currentUser.totpSecret) {
                logger.warn('verifyAndEnable: 未生成TOTP设置', { userId, username: currentUser.username });
                return res.status(400).json({ error: '请先生成TOTP设置' });
            }

            // 检查TOTP验证尝试次数
            const attemptCheck = TOTPController.checkTOTPAttempts(userId);
            if (!attemptCheck.allowed) {
                const remainingTime = Math.ceil((attemptCheck.lockedUntil! - Date.now()) / 1000 / 60);
                logger.warn('verifyAndEnable: 验证尝试次数过多', { userId, username: currentUser.username, lockedUntil: attemptCheck.lockedUntil });
                return res.status(429).json({ 
                    error: `验证尝试次数过多，请${remainingTime}分钟后再试`,
                    lockedUntil: attemptCheck.lockedUntil
                });
            }

            // 验证令牌
            const isValid = TOTPService.verifyToken(token, currentUser.totpSecret);
            logger.info('verifyAndEnable: 验证TOTP令牌', { userId, username: currentUser.username, token, isValid });
            
            // 记录验证尝试
            TOTPController.recordTOTPAttempt(userId, isValid);
            
            if (!isValid) {
                const remainingAttempts = attemptCheck.remainingAttempts - 1;
                
                // 生成当前时间窗口的期望验证码用于调试
                const expectedToken = TOTPDebugger.generateTestToken(currentUser.totpSecret, 0);
                const prevToken = TOTPDebugger.generateTestToken(currentUser.totpSecret, -30);
                const nextToken = TOTPDebugger.generateTestToken(currentUser.totpSecret, 30);
                
                logger.warn('verifyAndEnable: 验证码错误', { 
                    userId, 
                    username: currentUser.username, 
                    token, 
                    remainingAttempts,
                    expectedToken,
                    prevToken,
                    nextToken
                });
                
                return res.status(400).json({ 
                    error: '验证码错误',
                    remainingAttempts,
                    lockedUntil: remainingAttempts === 0 ? Date.now() + TOTP_LOCKOUT_DURATION : undefined,
                    debug: {
                        expectedToken,
                        prevToken,
                        nextToken,
                        message: '这些是服务器当前时间窗口的期望验证码，用于调试时间同步问题'
                    }
                });
            }

            // 启用TOTP
            await TOTPController.updateUserTOTP(userId, currentUser.totpSecret, true, currentUser.backupCodes || []);

            logger.info('TOTP启用成功:', { userId, username: currentUser.username });

            res.json({
                message: 'TOTP设置成功',
                enabled: true
            });
        } catch (error) {
            logger.error('验证并启用TOTP失败:', {
                error: error instanceof Error ? error.message : String(error),
                stack: error instanceof Error ? error.stack : undefined,
                userId: currentUser?.id,
                username: currentUser?.username,
                body: req.body
            });
            res.status(500).json({ error: '验证并启用TOTP失败' });
        }
    }

    /**
     * 验证TOTP令牌（登录时使用）
     */
    public static async verifyToken(req: Request, res: Response) {
        try {
            const { userId, token, backupCode } = req.body;

            if (!userId || (!token && !backupCode)) {
                return res.status(400).json({ error: '请提供用户ID和验证码或恢复码' });
            }

            const user = await UserStorage.getUserById(userId);
            if (!user) {
                return res.status(404).json({ error: '用户不存在' });
            }

            if (!user.totpEnabled) {
                return res.status(400).json({ error: '用户未启用TOTP' });
            }

            // 检查TOTP验证尝试次数（仅对TOTP令牌验证）
            if (token) {
                const attemptCheck = TOTPController.checkTOTPAttempts(userId);
                if (!attemptCheck.allowed) {
                    const remainingTime = Math.ceil((attemptCheck.lockedUntil! - Date.now()) / 1000 / 60);
                    return res.status(429).json({ 
                        error: `验证尝试次数过多，请${remainingTime}分钟后再试`,
                        lockedUntil: attemptCheck.lockedUntil
                    });
                }
            }

            let isValid = false;

            if (token) {
                // 验证TOTP令牌
                isValid = TOTPService.verifyToken(token, user.totpSecret!);
                
                // 记录验证尝试
                TOTPController.recordTOTPAttempt(userId, isValid);
            } else if (backupCode) {
                // 验证备用恢复码
                if (!user.backupCodes || user.backupCodes.length === 0) {
                    return res.status(400).json({ error: '用户没有设置备用恢复码' });
                }
                
                // 记录验证前的恢复码数量
                const originalCount = user.backupCodes.length;
                const backupCodes = [...user.backupCodes];
                
                isValid = TOTPService.verifyBackupCode(backupCode, backupCodes);
                
                if (isValid) {
                    // 更新用户的备用恢复码（报废已使用的恢复码）
                    await TOTPController.updateUserBackupCodes(userId, backupCodes);
                    
                    // 记录详细的报废信息
                    const usedCode = (typeof backupCode === 'string' ? backupCode : String(backupCode ?? '')).toUpperCase().replace(/[^A-Z0-9]/g, '');
                    const remainingCount = backupCodes.length;
                    
                    logger.info('备用恢复码验证成功并已报废:', { 
                        userId, 
                        username: user.username,
                        usedCode,
                        originalCount,
                        remainingCount,
                        codesRemoved: originalCount - remainingCount
                    });
                    
                    // 如果恢复码用完，记录警告
                    if (remainingCount === 0) {
                        logger.warn('用户所有备用恢复码已用完:', { 
                            userId, 
                            username: user.username 
                        });
                    } else if (remainingCount <= 3) {
                        logger.warn('用户备用恢复码数量不足:', { 
                            userId, 
                            username: user.username,
                            remainingCount 
                        });
                    }
                } else {
                    // 记录失败的验证尝试
                    logger.warn('备用恢复码验证失败:', { 
                        userId, 
                        username: user.username,
                        attemptedCode: (typeof backupCode === 'string' ? backupCode : String(backupCode ?? '')).toUpperCase().replace(/[^A-Z0-9]/g, ''),
                        availableCodes: user.backupCodes.length
                    });
                }
            }

            if (!isValid) {
                if (token) {
                    const attemptCheck = TOTPController.checkTOTPAttempts(userId);
                    const remainingAttempts = attemptCheck.remainingAttempts - 1;
                    
                    // 生成当前时间窗口的期望验证码用于调试
                    const expectedToken = TOTPDebugger.generateTestToken(user.totpSecret!, 0);
                    const prevToken = TOTPDebugger.generateTestToken(user.totpSecret!, -30);
                    const nextToken = TOTPDebugger.generateTestToken(user.totpSecret!, 30);
                    
                    logger.warn('verifyToken: TOTP验证码错误', { 
                        userId, 
                        username: user.username, 
                        token, 
                        remainingAttempts,
                        expectedToken,
                        prevToken,
                        nextToken
                    });
                    
                    return res.status(400).json({ 
                        error: '验证码错误',
                        remainingAttempts,
                        lockedUntil: remainingAttempts === 0 ? Date.now() + TOTP_LOCKOUT_DURATION : undefined,
                        debug: {
                            expectedToken,
                            prevToken,
                            nextToken,
                            message: '这些是服务器当前时间窗口的期望验证码，用于调试时间同步问题'
                        }
                    });
                } else {
                    return res.status(400).json({ error: '恢复码错误' });
                }
            }

            logger.info('TOTP验证成功:', { userId, username: user.username, usedBackupCode: !!backupCode });

            res.json({
                message: '验证成功',
                verified: true
            });
        } catch (error) {
            logger.error('验证TOTP令牌失败:', error);
            res.status(500).json({ error: '验证TOTP令牌失败' });
        }
    }

    /**
     * 禁用TOTP
     */
    public static async disable(req: Request, res: Response) {
        try {
            // @ts-ignore
            const user = req.user as any;
            if (!user) {
                return res.status(401).json({ error: '未授权访问' });
            }

            const userId = user.id;
            const { token } = req.body;

            if (!user.totpEnabled) {
                return res.status(400).json({ error: 'TOTP未启用' });
            }

            // 检查TOTP验证尝试次数
            const attemptCheck = TOTPController.checkTOTPAttempts(userId);
            if (!attemptCheck.allowed) {
                const remainingTime = Math.ceil((attemptCheck.lockedUntil! - Date.now()) / 1000 / 60);
                return res.status(429).json({ 
                    error: `验证尝试次数过多，请${remainingTime}分钟后再试`,
                    lockedUntil: attemptCheck.lockedUntil
                });
            }

            // 验证令牌
            const isValid = TOTPService.verifyToken(token, user.totpSecret!);
            
            // 记录验证尝试
            TOTPController.recordTOTPAttempt(userId, isValid);
            
            if (!isValid) {
                const remainingAttempts = attemptCheck.remainingAttempts - 1;
                
                // 生成当前时间窗口的期望验证码用于调试
                const expectedToken = TOTPDebugger.generateTestToken(user.totpSecret!, 0);
                const prevToken = TOTPDebugger.generateTestToken(user.totpSecret!, -30);
                const nextToken = TOTPDebugger.generateTestToken(user.totpSecret!, 30);
                
                logger.warn('disable: TOTP验证码错误', { 
                    userId, 
                    username: user.username, 
                    token, 
                    remainingAttempts,
                    expectedToken,
                    prevToken,
                    nextToken
                });
                
                return res.status(400).json({ 
                    error: '验证码错误',
                    remainingAttempts,
                    lockedUntil: remainingAttempts === 0 ? Date.now() + TOTP_LOCKOUT_DURATION : undefined,
                    debug: {
                        expectedToken,
                        prevToken,
                        nextToken,
                        message: '这些是服务器当前时间窗口的期望验证码，用于调试时间同步问题'
                    }
                });
            }

            // 禁用TOTP
            await TOTPController.updateUserTOTP(userId, '', false, []);

            logger.info('TOTP禁用成功:', { userId, username: user.username });

            res.json({
                message: 'TOTP已禁用',
                enabled: false
            });
        } catch (error) {
            logger.error('禁用TOTP失败:', error);
            res.status(500).json({ error: '禁用TOTP失败' });
        }
    }

    /**
     * 获取TOTP状态
     */
    public static async getStatus(req: Request, res: Response) {
        try {
            // @ts-ignore
            const user = req.user as any;
            if (!user) {
                return res.status(401).json({ error: '未授权访问' });
            }

            res.json({
                enabled: user.totpEnabled || false,
                hasBackupCodes: !!(user.backupCodes && user.backupCodes.length > 0)
            });
        } catch (error) {
            logger.error('获取TOTP状态失败:', error);
            res.status(500).json({ error: '获取TOTP状态失败' });
        }
    }

    /**
     * 获取备用恢复码
     */
    public static async getBackupCodes(req: Request, res: Response) {
        try {
            // @ts-ignore
            const user = req.user as any;
            if (!user) {
                return res.status(401).json({ error: '未授权访问' });
            }

            if (!user.totpEnabled) {
                return res.status(400).json({ error: 'TOTP未启用' });
            }

            if (!user.backupCodes || user.backupCodes.length === 0) {
                return res.status(404).json({ error: '没有可用的备用恢复码' });
            }

            logger.info('获取备用恢复码成功:', { userId: user.id, username: user.username, remainingCodes: user.backupCodes.length });

            res.json({
                backupCodes: user.backupCodes,
                remainingCount: user.backupCodes.length,
                message: '备用恢复码获取成功'
            });
        } catch (error) {
            logger.error('获取备用恢复码失败:', error);
            res.status(500).json({ error: '获取备用恢复码失败' });
        }
    }

    /**
     * 重新生成备用恢复码
     */
    public static async regenerateBackupCodes(req: Request, res: Response) {
        try {
            // @ts-ignore
            const user = req.user as any;
            if (!user) {
                return res.status(401).json({ error: '未授权访问' });
            }

            const userId = user.id;

            if (!user.totpEnabled) {
                return res.status(400).json({ error: 'TOTP未启用' });
            }

            // 生成新的备用恢复码
            const newBackupCodes = TOTPService.generateBackupCodes();
            
            // 更新用户的备用恢复码
            await TOTPController.updateUserBackupCodes(userId, newBackupCodes);

            logger.info('备用恢复码重新生成成功:', { 
                userId, 
                username: user.username, 
                newCodesCount: newBackupCodes.length,
                previousCodesCount: user.backupCodes?.length || 0
            });

            res.json({
                backupCodes: newBackupCodes,
                remainingCount: newBackupCodes.length,
                message: '备用恢复码重新生成成功'
            });
        } catch (error) {
            logger.error('重新生成备用恢复码失败:', error);
            res.status(500).json({ error: '重新生成备用恢复码失败' });
        }
    }

    /**
     * 更新用户TOTP信息
     */
    private static async updateUserTOTP(userId: string, secret: string, enabled: boolean, backupCodes: string[]): Promise<void> {
        const USERS_FILE = path.join(process.cwd(), 'data', 'users.json');
        if (!fs.existsSync(USERS_FILE)) {
            logger.error('用户数据文件不存在:', { filePath: USERS_FILE });
            throw new Error('用户数据文件不存在');
        }

        try {
            const data = await fs.promises.readFile(USERS_FILE, 'utf-8');
            const users = JSON.parse(data);
            const userIndex = users.findIndex((u: any) => u.id === userId);
            
            if (userIndex === -1) {
                logger.error('用户不存在:', { userId });
                throw new Error('用户不存在');
            }

            users[userIndex].totpSecret = secret;
            users[userIndex].totpEnabled = enabled;
            users[userIndex].backupCodes = backupCodes;

            // 使用临时文件确保写入的原子性
            const tempFile = `${USERS_FILE}.tmp`;
            await fs.promises.writeFile(tempFile, JSON.stringify(users, null, 2));
            await fs.promises.rename(tempFile, USERS_FILE);
            
            logger.info('TOTP信息更新成功:', { userId, enabled });
        } catch (error) {
            logger.error('更新用户TOTP信息失败:', { error, userId });
            throw error;
        }
    }

    /**
     * 更新用户备用恢复码
     */
    private static async updateUserBackupCodes(userId: string, backupCodes: string[]): Promise<void> {
        const USERS_FILE = path.join(process.cwd(), 'data', 'users.json');
        if (!fs.existsSync(USERS_FILE)) {
            logger.error('用户数据文件不存在:', { filePath: USERS_FILE });
            throw new Error('用户数据文件不存在');
        }

        try {
            const data = await fs.promises.readFile(USERS_FILE, 'utf-8');
            const users = JSON.parse(data);
            const userIndex = users.findIndex((u: any) => u.id === userId);
            
            if (userIndex === -1) {
                logger.error('用户不存在:', { userId });
                throw new Error('用户不存在');
            }

            users[userIndex].backupCodes = backupCodes;

            // 使用临时文件确保写入的原子性
            const tempFile = `${USERS_FILE}.tmp`;
            await fs.promises.writeFile(tempFile, JSON.stringify(users, null, 2));
            await fs.promises.rename(tempFile, USERS_FILE);
            
            logger.info('备用恢复码更新成功:', { userId, remainingCodes: backupCodes.length });
        } catch (error) {
            logger.error('更新用户备用恢复码失败:', { error, userId });
            throw error;
        }
    }
} 