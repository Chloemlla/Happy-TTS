import { UserStorage, User } from '../utils/userStorage';
import logger from '../utils/logger';

// 自动修复用户历史passkey credentialID为base64url字符串
async function fixUserPasskeyCredentialIDs(user: User): Promise<boolean> {
    if (!user) {
        logger.warn('[Passkey数据修复] 用户对象为空');
        return false;
    }
    
    if (!Array.isArray(user.passkeyCredentials)) {
        logger.warn('[Passkey数据修复] passkeyCredentials不是数组，重置为空数组', { 
            userId: user.id, 
            type: typeof user.passkeyCredentials,
            value: user.passkeyCredentials 
        });
        user.passkeyCredentials = [];
        await UserStorage.updateUser(user.id, { passkeyCredentials: [] });
        return true;
    }
    
    let changed = false;
    const validPattern = /^[A-Za-z0-9_-]+$/;
    
    for (let i = 0; i < user.passkeyCredentials.length; i++) {
        const cred = user.passkeyCredentials[i];
        if (!cred || typeof cred !== 'object') {
            logger.warn('[Passkey数据修复] 发现无效的credential对象，剔除', { 
                userId: user.id, 
                index: i, 
                cred 
            });
            user.passkeyCredentials[i] = null as any;
            changed = true;
            continue;
        }
        
        let original = cred.credentialID;
        let fixed = null;
        let reason = '';
        
        try {
            if (typeof original === 'string' && validPattern.test(original)) {
                continue; // 已合规
            }
            
            if (original == null || original === undefined) {
                reason = 'credentialID为null/undefined，剔除';
                user.passkeyCredentials[i] = null as any;
                changed = true;
                continue;
            }
            
            // 尝试Buffer转base64url
            if (Buffer.isBuffer(original)) {
                fixed = original.toString('base64url');
            } else if (typeof original === 'string') {
                // 如果是字符串但不是base64url格式，尝试转换
                try {
                    // 先尝试解码，再重新编码为base64url
                    const buffer = Buffer.from(original, 'base64');
                    fixed = buffer.toString('base64url');
                } catch {
                    // 如果解码失败，直接转换为base64url
                    fixed = Buffer.from(original).toString('base64url');
                }
            } else {
                // 其他类型，强制转换为字符串再转base64url
                fixed = Buffer.from(String(original)).toString('base64url');
            }
            
            cred.credentialID = fixed;
            reason = '异常类型，强制转base64url';
            changed = true;
            
        } catch (e) {
            reason = 'credentialID彻底无法修复，剔除';
            user.passkeyCredentials[i] = null as any;
            changed = true;
        }
        
        logger.warn('[Passkey数据修复] credentialID修复', {
            userId: user.id,
            original,
            fixed,
            reason
        });
    }
    
    // 剔除所有无效credential
    const before = user.passkeyCredentials.length;
    user.passkeyCredentials = user.passkeyCredentials.filter(c => 
        c && 
        typeof c === 'object' && 
        typeof c.credentialID === 'string' && 
        validPattern.test(c.credentialID) && 
        c.credentialID.length > 0
    );
    const after = user.passkeyCredentials.length;
    
    if (before !== after) {
        logger.warn('[Passkey数据修复] 剔除无效credentialID', { userId: user.id, before, after });
        changed = true;
    }
    
    if (changed) {
        await UserStorage.updateUser(user.id, { passkeyCredentials: user.passkeyCredentials });
        logger.info('[Passkey数据修复] 已更新用户passkeyCredentials', { userId: user.id });
    }
    
    return changed;
}

export class PasskeyDataRepairService {
    /**
     * 启动时自动修复所有用户的Passkey数据
     */
    public static async repairAllUsersPasskeyData(): Promise<void> {
        try {
            logger.info('[Passkey数据修复] 开始启动时数据修复检查...');
            
            // 添加重试机制
            let allUsers;
            let retryCount = 0;
            const maxRetries = 3;
            
            while (retryCount < maxRetries) {
                try {
                    allUsers = await UserStorage.getAllUsers();
                    break; // 成功获取数据，跳出重试循环
                } catch (error) {
                    retryCount++;
                    logger.warn('[Passkey数据修复] 读取用户数据失败，尝试重试', { 
                        retryCount, 
                        maxRetries,
                        error: error instanceof Error ? error.message : String(error)
                    });
                    
                    if (retryCount >= maxRetries) {
                        logger.error('[Passkey数据修复] 读取用户数据最终失败，跳过数据修复', { 
                            error: error instanceof Error ? error.message : String(error)
                        });
                        return; // 放弃修复，不阻止服务器启动
                    }
                    
                    // 等待一段时间后重试
                    await new Promise(resolve => setTimeout(resolve, 1000 * retryCount));
                }
            }
            
            if (!allUsers || allUsers.length === 0) {
                logger.info('[Passkey数据修复] 没有用户数据需要修复');
                return;
            }
            
            logger.info('[Passkey数据修复] 获取到用户总数', { totalUsers: allUsers.length });
            
            let repairedUsers = 0;
            let totalRepairedCredentials = 0;
            
            for (const user of allUsers) {
                try {
                    // 只处理启用了Passkey的用户
                    if (user.passkeyEnabled && user.passkeyCredentials && user.passkeyCredentials.length > 0) {
                        logger.info('[Passkey数据修复] 检查用户Passkey数据', { 
                            userId: user.id, 
                            username: user.username,
                            credentialsCount: user.passkeyCredentials.length 
                        });
                        
                        const wasRepaired = await fixUserPasskeyCredentialIDs(user);
                        
                        if (wasRepaired) {
                            repairedUsers++;
                            const validCredentials = (user.passkeyCredentials || []).filter(c => 
                                c && 
                                typeof c === 'object' && 
                                typeof c.credentialID === 'string' && 
                                /^[A-Za-z0-9_-]+$/.test(c.credentialID) && 
                                c.credentialID.length > 0
                            );
                            totalRepairedCredentials += validCredentials.length;
                            
                            logger.info('[Passkey数据修复] 用户数据修复完成', { 
                                userId: user.id, 
                                username: user.username,
                                validCredentialsCount: validCredentials.length 
                            });
                        }
                    }
                } catch (error) {
                    logger.error('[Passkey数据修复] 修复用户数据时出错', { 
                        userId: user.id, 
                        username: user.username,
                        error: error instanceof Error ? error.message : String(error) 
                    });
                    // 继续处理其他用户，不因为单个用户失败而停止
                }
            }
            
            logger.info('[Passkey数据修复] 启动时数据修复完成', { 
                totalUsers: allUsers.length,
                repairedUsers,
                totalRepairedCredentials
            });
            
        } catch (error) {
            logger.error('[Passkey数据修复] 启动时数据修复失败', { 
                error: error instanceof Error ? error.message : String(error),
                stack: error instanceof Error ? error.stack : undefined
            });
            // 不抛出错误，避免阻止服务器启动
        }
    }
    
    /**
     * 检查单个用户的Passkey数据是否需要修复
     */
    public static async checkUserPasskeyData(userId: string): Promise<{
        needsRepair: boolean;
        issues: string[];
        validCredentialsCount: number;
    }> {
        try {
            const user = await UserStorage.getUserById(userId);
            if (!user) {
                return {
                    needsRepair: false,
                    issues: ['用户不存在'],
                    validCredentialsCount: 0
                };
            }
            
            const issues: string[] = [];
            
            // 检查passkeyCredentials是否为数组
            if (!Array.isArray(user.passkeyCredentials)) {
                issues.push('passkeyCredentials不是数组');
            }
            
            // 检查每个credential
            if (Array.isArray(user.passkeyCredentials)) {
                for (let i = 0; i < user.passkeyCredentials.length; i++) {
                    const cred = user.passkeyCredentials[i];
                    
                    if (!cred || typeof cred !== 'object') {
                        issues.push(`索引${i}: credential对象无效`);
                        continue;
                    }
                    
                    const credentialID = cred.credentialID;
                    if (credentialID == null || credentialID === undefined) {
                        issues.push(`索引${i}: credentialID为null/undefined`);
                    } else if (typeof credentialID !== 'string') {
                        issues.push(`索引${i}: credentialID类型错误(${typeof credentialID})`);
                    } else if (!/^[A-Za-z0-9_-]+$/.test(credentialID)) {
                        issues.push(`索引${i}: credentialID格式无效`);
                    } else if (credentialID.length === 0) {
                        issues.push(`索引${i}: credentialID为空字符串`);
                    }
                }
            }
            
            const validCredentials = user.passkeyCredentials?.filter(c => 
                c && 
                typeof c === 'object' && 
                typeof c.credentialID === 'string' && 
                /^[A-Za-z0-9_-]+$/.test(c.credentialID) && 
                c.credentialID.length > 0
            ) || [];
            
            return {
                needsRepair: issues.length > 0,
                issues,
                validCredentialsCount: validCredentials.length
            };
            
        } catch (error) {
            logger.error('[Passkey数据修复] 检查用户数据时出错', { 
                userId,
                error: error instanceof Error ? error.message : String(error) 
            });
            
            return {
                needsRepair: true,
                issues: ['检查过程中出错'],
                validCredentialsCount: 0
            };
        }
    }
    
    /**
     * 手动修复指定用户的Passkey数据
     */
    public static async repairUserPasskeyData(userId: string): Promise<{
        success: boolean;
        message: string;
        repairedCredentialsCount: number;
    }> {
        try {
            const user = await UserStorage.getUserById(userId);
            if (!user) {
                return {
                    success: false,
                    message: '用户不存在',
                    repairedCredentialsCount: 0
                };
            }
            
            const wasRepaired = await fixUserPasskeyCredentialIDs(user);
            
            if (wasRepaired) {
                const validCredentials = (user.passkeyCredentials || []).filter(c => 
                    c && 
                    typeof c === 'object' && 
                    typeof c.credentialID === 'string' && 
                    /^[A-Za-z0-9_-]+$/.test(c.credentialID) && 
                    c.credentialID.length > 0
                );
                
                return {
                    success: true,
                    message: '数据修复成功',
                    repairedCredentialsCount: validCredentials.length
                };
            } else {
                return {
                    success: true,
                    message: '数据无需修复',
                    repairedCredentialsCount: (user.passkeyCredentials || []).length
                };
            }
            
        } catch (error) {
            logger.error('[Passkey数据修复] 手动修复用户数据时出错', { 
                userId,
                error: error instanceof Error ? error.message : String(error) 
            });
            
            return {
                success: false,
                message: '修复过程中出错',
                repairedCredentialsCount: 0
            };
        }
    }
} 