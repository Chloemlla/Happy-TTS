import { UserStorage, User } from './userStorage';
import logger from './logger';

/**
 * Passkey CredentialID 修复工具
 * 用于修复用户数据中credentialID格式不一致的问题
 */
export class PasskeyCredentialIdFixer {
    
    /**
     * 修复单个用户的credentialID
     */
    public static async fixUserCredentialIds(userId: string): Promise<{
        success: boolean;
        message: string;
        fixedCredentials: number;
        totalCredentials: number;
    }> {
        try {
            const user = await UserStorage.getUserById(userId);
            if (!user) {
                return {
                    success: false,
                    message: '用户不存在',
                    fixedCredentials: 0,
                    totalCredentials: 0
                };
            }

            if (!user.passkeyEnabled || !user.passkeyCredentials || user.passkeyCredentials.length === 0) {
                return {
                    success: true,
                    message: '用户未启用Passkey或无凭证',
                    fixedCredentials: 0,
                    totalCredentials: 0
                };
            }

            const totalCredentials = user.passkeyCredentials.length;
            let fixedCredentials = 0;
            let hasChanges = false;

            // 修复每个credential的credentialID
            for (let i = 0; i < user.passkeyCredentials.length; i++) {
                const cred = user.passkeyCredentials[i];
                if (!cred || typeof cred !== 'object') {
                    logger.warn('[CredentialID修复] 发现无效的credential对象，剔除', {
                        userId: user.id,
                        index: i,
                        cred
                    });
                    user.passkeyCredentials[i] = null as any;
                    hasChanges = true;
                    continue;
                }

                const originalCredentialId = cred.credentialID;
                const fixedCredentialId = this.fixCredentialId(originalCredentialId);

                if (fixedCredentialId !== originalCredentialId) {
                    cred.credentialID = fixedCredentialId;
                    fixedCredentials++;
                    hasChanges = true;
                    
                    logger.info('[CredentialID修复] 修复credentialID', {
                        userId: user.id,
                        index: i,
                        original: originalCredentialId?.substring(0, 10) + '...',
                        fixed: fixedCredentialId.substring(0, 10) + '...'
                    });
                }
            }

            // 剔除无效的credential
            const beforeFilter = user.passkeyCredentials.length;
            user.passkeyCredentials = user.passkeyCredentials.filter(c => 
                c && 
                typeof c === 'object' && 
                typeof c.credentialID === 'string' && 
                c.credentialID.length > 0
            );
            const afterFilter = user.passkeyCredentials.length;

            if (beforeFilter !== afterFilter) {
                hasChanges = true;
                logger.info('[CredentialID修复] 剔除无效credential', {
                    userId: user.id,
                    before: beforeFilter,
                    after: afterFilter
                });
            }

            // 如果有变化，保存到数据库
            if (hasChanges) {
                await UserStorage.updateUser(user.id, {
                    passkeyCredentials: user.passkeyCredentials,
                    passkeyEnabled: user.passkeyCredentials.length > 0
                });
                
                logger.info('[CredentialID修复] 用户数据已更新', {
                    userId: user.id,
                    fixedCredentials,
                    totalCredentials: afterFilter
                });
            }

            return {
                success: true,
                message: `修复完成，修复了 ${fixedCredentials} 个credentialID，总共 ${afterFilter} 个有效凭证`,
                fixedCredentials,
                totalCredentials: afterFilter
            };

        } catch (error) {
            logger.error('[CredentialID修复] 修复用户credentialID失败', {
                userId,
                error: error instanceof Error ? error.message : String(error)
            });
            
            return {
                success: false,
                message: '修复失败: ' + (error instanceof Error ? error.message : String(error)),
                fixedCredentials: 0,
                totalCredentials: 0
            };
        }
    }

    /**
     * 修复所有用户的credentialID
     */
    public static async fixAllUsersCredentialIds(): Promise<{
        success: boolean;
        message: string;
        totalUsers: number;
        fixedUsers: number;
        totalFixedCredentials: number;
    }> {
        try {
            const allUsers = await UserStorage.getAllUsers();
            let fixedUsers = 0;
            let totalFixedCredentials = 0;

            for (const user of allUsers) {
                if (user.passkeyEnabled && user.passkeyCredentials && user.passkeyCredentials.length > 0) {
                    const result = await this.fixUserCredentialIds(user.id);
                    if (result.success && result.fixedCredentials > 0) {
                        fixedUsers++;
                        totalFixedCredentials += result.fixedCredentials;
                    }
                }
            }

            return {
                success: true,
                message: `批量修复完成，修复了 ${fixedUsers} 个用户的 ${totalFixedCredentials} 个credentialID`,
                totalUsers: allUsers.length,
                fixedUsers,
                totalFixedCredentials
            };

        } catch (error) {
            logger.error('[CredentialID修复] 批量修复失败', {
                error: error instanceof Error ? error.message : String(error)
            });
            
            return {
                success: false,
                message: '批量修复失败: ' + (error instanceof Error ? error.message : String(error)),
                totalUsers: 0,
                fixedUsers: 0,
                totalFixedCredentials: 0
            };
        }
    }

    /**
     * 修复单个credentialID
     */
    private static fixCredentialId(credentialId: any): string {
        if (!credentialId) {
            throw new Error('credentialID为空');
        }

        // 如果已经是正确的base64url格式，直接返回
        if (typeof credentialId === 'string' && /^[A-Za-z0-9_-]+$/.test(credentialId)) {
            return credentialId;
        }

        // 尝试转换为base64url格式
        try {
            if (Buffer.isBuffer(credentialId)) {
                return credentialId.toString('base64url');
            }
            
            if (typeof credentialId === 'string') {
                // 尝试从base64解码再重新编码为base64url
                try {
                    const buffer = Buffer.from(credentialId, 'base64');
                    return buffer.toString('base64url');
                } catch {
                    // 如果解码失败，直接转换为base64url
                    return Buffer.from(credentialId).toString('base64url');
                }
            }
            
            // 其他类型，强制转换为字符串再转base64url
            return Buffer.from(String(credentialId)).toString('base64url');
            
        } catch (error) {
            throw new Error(`无法修复credentialID: ${credentialId} - ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /**
     * 检查credentialID是否有效
     */
    public static isValidCredentialId(credentialId: any): boolean {
        return credentialId && 
               typeof credentialId === 'string' && 
               /^[A-Za-z0-9_-]+$/.test(credentialId) && 
               credentialId.length > 0;
    }

    /**
     * 获取credentialID的详细信息
     */
    public static getCredentialIdInfo(credentialId: any): {
        isValid: boolean;
        type: string;
        length: number;
        format: string;
        issues: string[];
    } {
        const issues: string[] = [];
        let isValid = false;
        let format = 'unknown';

        if (!credentialId) {
            issues.push('credentialID为空');
        } else if (typeof credentialId !== 'string') {
            issues.push(`credentialID类型错误: ${typeof credentialId}`);
        } else if (credentialId.length === 0) {
            issues.push('credentialID长度为0');
        } else if (!/^[A-Za-z0-9_-]+$/.test(credentialId)) {
            issues.push('credentialID格式不是有效的base64url');
            // 尝试检测格式
            if (/^[A-Za-z0-9+/]+=*$/.test(credentialId)) {
                format = 'base64';
            } else if (/^[A-Za-z0-9_-]+$/.test(credentialId)) {
                format = 'base64url';
            } else {
                format = 'unknown';
            }
        } else {
            isValid = true;
            format = 'base64url';
        }

        return {
            isValid,
            type: typeof credentialId,
            length: credentialId?.length || 0,
            format,
            issues
        };
    }
} 