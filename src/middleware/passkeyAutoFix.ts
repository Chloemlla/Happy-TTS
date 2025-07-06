import { Request, Response, NextFunction } from 'express';
import { PasskeyService } from '../services/passkeyService';
import { UserStorage } from '../utils/userStorage';
import logger from '../utils/logger';

/**
 * Passkey自动修复中间件
 * 在Passkey相关请求中自动检测和修复数据问题
 */
export const passkeyAutoFixMiddleware = async (req: Request, res: Response, next: NextFunction) => {
    try {
        // 只对Passkey相关路由进行处理
        if (!req.path.includes('/passkey/')) {
            return next();
        }

        // 对于认证完成请求，进行特殊处理
        if (req.path === '/api/passkey/authenticate/finish' && req.method === 'POST') {
            const { username } = req.body;
            
            if (username) {
                logger.info('[Passkey中间件] 检测到认证请求，进行预检查', {
                    username,
                    path: req.path,
                    method: req.method
                });

                // 获取用户数据并进行预检查
                const user = await UserStorage.getUserByUsername(username);
                if (user) {
                    // 检查用户Passkey数据状态
                    const needsFix = await checkUserPasskeyDataHealth(user);
                    
                    if (needsFix) {
                        logger.info('[Passkey中间件] 检测到数据问题，进行自动修复', {
                            username,
                            userId: user.id
                        });
                        
                        // 执行自动修复
                        await PasskeyService.autoFixUserPasskeyData(user);
                        
                        logger.info('[Passkey中间件] 自动修复完成', {
                            username,
                            userId: user.id
                        });
                    }
                }
            }
        }

        // 对于注册相关请求，也进行检查
        if ((req.path === '/api/passkey/register/start' || req.path === '/api/passkey/register/finish') && req.method === 'POST') {
            const userId = (req as any).user?.id;
            
            if (userId) {
                logger.info('[Passkey中间件] 检测到注册请求，进行预检查', {
                    userId,
                    path: req.path,
                    method: req.method
                });

                // 获取用户数据并进行预检查
                const user = await UserStorage.getUserById(userId);
                if (user) {
                    // 检查用户Passkey数据状态
                    const needsFix = await checkUserPasskeyDataHealth(user);
                    
                    if (needsFix) {
                        logger.info('[Passkey中间件] 检测到数据问题，进行自动修复', {
                            userId: user.id,
                            username: user.username
                        });
                        
                        // 执行自动修复
                        await PasskeyService.autoFixUserPasskeyData(user);
                        
                        logger.info('[Passkey中间件] 自动修复完成', {
                            userId: user.id,
                            username: user.username
                        });
                    }
                }
            }
        }

        next();
    } catch (error) {
        logger.error('[Passkey中间件] 自动修复中间件执行失败:', {
            error: error instanceof Error ? error.message : String(error),
            path: req.path,
            method: req.method
        });
        
        // 中间件错误不应该阻止请求继续
        next();
    }
};

/**
 * 检查用户Passkey数据健康状态
 */
async function checkUserPasskeyDataHealth(user: any): Promise<boolean> {
    try {
        // 检查基本字段是否存在
        if (user.passkeyEnabled === undefined) {
            logger.info('[Passkey中间件] 检测到缺少passkeyEnabled字段', { userId: user.id });
            return true;
        }

        if (!user.passkeyCredentials) {
            logger.info('[Passkey中间件] 检测到缺少passkeyCredentials字段', { userId: user.id });
            return true;
        }

        // 检查credentialID格式
        if (user.passkeyCredentials && user.passkeyCredentials.length > 0) {
            for (const cred of user.passkeyCredentials) {
                if (!cred || typeof cred !== 'object') {
                    logger.info('[Passkey中间件] 检测到无效的credential对象', { userId: user.id });
                    return true;
                }

                if (!cred.credentialID || typeof cred.credentialID !== 'string') {
                    logger.info('[Passkey中间件] 检测到无效的credentialID', { userId: user.id });
                    return true;
                }

                // 检查credentialID格式
                if (!/^[A-Za-z0-9_-]+$/.test(cred.credentialID)) {
                    logger.info('[Passkey中间件] 检测到credentialID格式不正确', { 
                        userId: user.id,
                        credentialID: cred.credentialID?.substring(0, 10) + '...'
                    });
                    return true;
                }
            }
        }

        // 检查passkeyEnabled状态是否与实际凭证数量一致
        const shouldBeEnabled = user.passkeyCredentials && user.passkeyCredentials.length > 0;
        if (user.passkeyEnabled !== shouldBeEnabled) {
            logger.info('[Passkey中间件] 检测到passkeyEnabled状态不一致', { 
                userId: user.id,
                current: user.passkeyEnabled,
                shouldBe: shouldBeEnabled
            });
            return true;
        }

        return false;
    } catch (error) {
        logger.error('[Passkey中间件] 检查用户数据健康状态失败:', {
            userId: user.id,
            error: error instanceof Error ? error.message : String(error)
        });
        return true; // 出错时认为需要修复
    }
}

/**
 * 全局Passkey错误处理中间件
 * 捕获Passkey相关的错误并进行自动修复
 */
export const passkeyErrorHandler = (error: any, req: Request, res: Response, next: NextFunction) => {
    // 只处理Passkey相关的错误
    if (!req.path.includes('/passkey/')) {
        return next(error);
    }

    // 检查是否是Passkey相关的错误
    const isPasskeyError = error?.message?.includes('验证认证响应失败') ||
                          error?.message?.includes('找不到匹配的认证器') ||
                          error?.message?.includes('Credential ID') ||
                          error?.message?.includes('base64url-encoded');

    if (isPasskeyError) {
        logger.info('[Passkey错误处理] 检测到Passkey相关错误，尝试自动修复', {
            path: req.path,
            method: req.method,
            error: error.message
        });

        // 尝试获取用户名进行修复
        const username = req.body?.username;
        if (username) {
            // 异步执行修复，不阻塞错误响应
            UserStorage.getUserByUsername(username)
                .then(user => {
                    if (user) {
                        return PasskeyService.autoFixUserPasskeyData(user);
                    }
                })
                .then(() => {
                    logger.info('[Passkey错误处理] 自动修复完成', { username });
                })
                .catch(fixError => {
                    logger.error('[Passkey错误处理] 自动修复失败:', {
                        username,
                        fixError: fixError instanceof Error ? fixError.message : String(fixError)
                    });
                });
        }
    }

    // 继续正常的错误处理流程
    next(error);
}; 