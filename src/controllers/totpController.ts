import { Request, Response } from 'express';
import { UserStorage } from '../utils/userStorage';
import { TOTPService } from '../services/totpService';
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
            const userId = req.headers.authorization?.replace('Bearer ', '');
            if (!userId) {
                return res.status(401).json({ error: '未授权访问' });
            }

            const user = await UserStorage.getUserById(userId);
            if (!user) {
                return res.status(404).json({ error: '用户不存在' });
            }

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
        try {
            const userId = req.headers.authorization?.replace('Bearer ', '');
            const { token } = req.body;

            if (!userId) {
                return res.status(401).json({ error: '未授权访问' });
            }

            if (!token) {
                return res.status(400).json({ error: '请提供验证码' });
            }

            const user = await UserStorage.getUserById(userId);
            if (!user) {
                return res.status(404).json({ error: '用户不存在' });
            }

            if (user.totpEnabled) {
                return res.status(400).json({ error: 'TOTP已经启用' });
            }

            if (!user.totpSecret) {
                return res.status(400).json({ error: '请先生成TOTP设置' });
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
            const isValid = TOTPService.verifyToken(token, user.totpSecret);
            
            // 记录验证尝试
            TOTPController.recordTOTPAttempt(userId, isValid);
            
            if (!isValid) {
                const remainingAttempts = attemptCheck.remainingAttempts - 1;
                return res.status(400).json({ 
                    error: '验证码错误',
                    remainingAttempts,
                    lockedUntil: remainingAttempts === 0 ? Date.now() + TOTP_LOCKOUT_DURATION : undefined
                });
            }

            // 启用TOTP
            await TOTPController.updateUserTOTP(userId, user.totpSecret, true, user.backupCodes || []);

            logger.info('TOTP启用成功:', { userId, username: user.username });

            res.json({
                message: 'TOTP设置成功',
                enabled: true
            });
        } catch (error) {
            logger.error('验证并启用TOTP失败:', error);
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
                const backupCodes = [...user.backupCodes];
                isValid = TOTPService.verifyBackupCode(backupCode, backupCodes);
                if (isValid) {
                    // 更新用户的备用恢复码
                    await TOTPController.updateUserBackupCodes(userId, backupCodes);
                    logger.info('备用恢复码验证成功:', { userId, username: user.username });
                }
            }

            if (!isValid) {
                if (token) {
                    const attemptCheck = TOTPController.checkTOTPAttempts(userId);
                    const remainingAttempts = attemptCheck.remainingAttempts - 1;
                    return res.status(400).json({ 
                        error: '验证码错误',
                        remainingAttempts,
                        lockedUntil: remainingAttempts === 0 ? Date.now() + TOTP_LOCKOUT_DURATION : undefined
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
            const userId = req.headers.authorization?.replace('Bearer ', '');
            const { token } = req.body;

            if (!userId) {
                return res.status(401).json({ error: '未授权访问' });
            }

            const user = await UserStorage.getUserById(userId);
            if (!user) {
                return res.status(404).json({ error: '用户不存在' });
            }

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
                return res.status(400).json({ 
                    error: '验证码错误',
                    remainingAttempts,
                    lockedUntil: remainingAttempts === 0 ? Date.now() + TOTP_LOCKOUT_DURATION : undefined
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
            const userId = req.headers.authorization?.replace('Bearer ', '');
            
            if (!userId) {
                return res.status(401).json({ error: '未授权访问' });
            }

            const user = await UserStorage.getUserById(userId);
            if (!user) {
                return res.status(404).json({ error: '用户不存在' });
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
     * 更新用户TOTP信息
     */
    private static async updateUserTOTP(userId: string, secret: string, enabled: boolean, backupCodes: string[]): Promise<void> {
        const USERS_FILE = path.join(process.cwd(), 'data', 'users.json');
        if (!fs.existsSync(USERS_FILE)) {
            logger.error('用户数据文件不存在:', { filePath: USERS_FILE });
            throw new Error('用户数据文件不存在');
        }

        try {
            const users = JSON.parse(fs.readFileSync(USERS_FILE, 'utf-8'));
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
            fs.writeFileSync(tempFile, JSON.stringify(users, null, 2));
            fs.renameSync(tempFile, USERS_FILE);
            
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
            const users = JSON.parse(fs.readFileSync(USERS_FILE, 'utf-8'));
            const userIndex = users.findIndex((u: any) => u.id === userId);
            
            if (userIndex === -1) {
                logger.error('用户不存在:', { userId });
                throw new Error('用户不存在');
            }

            users[userIndex].backupCodes = backupCodes;

            // 使用临时文件确保写入的原子性
            const tempFile = `${USERS_FILE}.tmp`;
            fs.writeFileSync(tempFile, JSON.stringify(users, null, 2));
            fs.renameSync(tempFile, USERS_FILE);
            
            logger.info('备用恢复码更新成功:', { userId, remainingCodes: backupCodes.length });
        } catch (error) {
            logger.error('更新用户备用恢复码失败:', { error, userId });
            throw error;
        }
    }
} 