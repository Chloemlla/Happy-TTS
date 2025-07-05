import {
    generateRegistrationOptions,
    generateAuthenticationOptions,
    verifyRegistrationResponse,
    verifyAuthenticationResponse,
    VerifiedRegistrationResponse,
    VerifiedAuthenticationResponse
} from '@simplewebauthn/server';
import { isoBase64URL } from '@simplewebauthn/server/helpers';
import { User, UserStorage } from '../utils/userStorage';
import jwt from 'jsonwebtoken';
import { config } from '../config/config';
import logger from '../utils/logger';
import { env } from '../config/env';

// 认证器模型
interface Authenticator {
    id: string;
    name: string;
    credentialID: string;
    credentialPublicKey: string;
    counter: number;
    createdAt: string;
}

// 获取 RP ID（依赖域名）
const getRpId = () => {
    return env.RP_ID;
};

// 获取 RP 原点
const getRpOrigin = () => {
    return env.RP_ORIGIN;
};

// 自动修复用户历史passkey credentialID为base64url字符串，并详细日志
async function fixUserPasskeyCredentialIDs(user: User) {
    if (!user) {
        logger.warn('[Passkey自愈] 用户对象为空');
        return;
    }
    
    if (!Array.isArray(user.passkeyCredentials)) {
        logger.warn('[Passkey自愈] passkeyCredentials不是数组，重置为空数组', { 
            userId: user.id, 
            type: typeof user.passkeyCredentials,
            value: user.passkeyCredentials 
        });
        user.passkeyCredentials = [];
        await UserStorage.updateUser(user.id, { passkeyCredentials: [] });
        return;
    }
    
    let changed = false;
    const validPattern = /^[A-Za-z0-9_-]+$/;
    
    for (let i = 0; i < user.passkeyCredentials.length; i++) {
        const cred = user.passkeyCredentials[i];
        if (!cred || typeof cred !== 'object') {
            logger.warn('[Passkey自愈] 发现无效的credential对象，剔除', { 
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
        
        logger.warn('[Passkey自愈] credentialID修复', {
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
        logger.warn('[Passkey自愈] 剔除无效credentialID', { userId: user.id, before, after });
        changed = true;
    }
    
    if (changed) {
        await UserStorage.updateUser(user.id, { passkeyCredentials: user.passkeyCredentials });
        logger.info('[Passkey自愈] 已更新用户passkeyCredentials', { userId: user.id });
    }
}

export class PasskeyService {
    // 获取用户的认证器列表
    public static async getCredentials(userId: string): Promise<Authenticator[]> {
        const user = await UserStorage.getUserById(userId);
        if (user) {
            await fixUserPasskeyCredentialIDs(user);
        }
        if (!user || !user.passkeyCredentials) {
            return [];
        }
        return user.passkeyCredentials;
    }

    // 生成注册选项
    public static async generateRegistrationOptions(user: User, credentialName: string) {
        await fixUserPasskeyCredentialIDs(user);
        if (!user) {
            throw new Error('generateRegistrationOptions: user 为空');
        }
        if (!user.id) {
            throw new Error('generateRegistrationOptions: user.id 为空');
        }
        if (!user.username) {
            throw new Error('generateRegistrationOptions: user.username 为空');
        }
        const userAuthenticators = user.passkeyCredentials || [];
        let options;
        try {
            options = await generateRegistrationOptions({
                rpName: 'Synapse',
                rpID: getRpId(),
                userID: Buffer.from(user.id),
                userName: user.username,
                attestationType: 'none',
                authenticatorSelection: {
                    authenticatorAttachment: 'platform',
                    requireResidentKey: true,
                    userVerification: 'required'
                },
                excludeCredentials: userAuthenticators.map(authenticator => ({
                    id: authenticator.credentialID,
                    type: 'public-key',
                    transports: ['internal']
                } as any))
            });
        } catch (err) {
            logger.error('[PasskeyService] generateRegistrationOptions 调用底层库异常:', err);
            throw new Error('generateRegistrationOptions: 调用底层库异常: ' + (err instanceof Error ? err.message : String(err)));
        }
        if (!options) {
            throw new Error('generateRegistrationOptions: options 为 undefined');
        }
        if (!options.challenge) {
            throw new Error('generateRegistrationOptions: options.challenge 为 undefined');
        }
        // 存储挑战到用户记录
        await UserStorage.updateUser(user.id, {
            pendingChallenge: options.challenge
        });
        return options;
    }

    // 验证注册
    public static async verifyRegistration(
        user: User,
        response: any,
        credentialName: string,
        requestOrigin?: string
    ): Promise<VerifiedRegistrationResponse> {
        if (!user.pendingChallenge) {
            throw new Error('注册会话已过期');
        }

        let verification: VerifiedRegistrationResponse;
        try {
            verification = await verifyRegistrationResponse({
                response,
                expectedChallenge: user.pendingChallenge,
                expectedOrigin: requestOrigin || getRpOrigin(),
                expectedRPID: getRpId()
            });
        } catch (error) {
            logger.error('验证注册响应失败:', error);
            throw new Error('验证注册响应失败');
        }

        const { verified, registrationInfo } = verification;
        if (!verified || !registrationInfo) {
            throw new Error('注册验证失败');
        }
        console.log('registrationInfo:', registrationInfo);
        const { credential } = registrationInfo as any;
        if (!credential || !credential.id || !credential.publicKey) {
            logger.error('注册信息不完整:', registrationInfo);
            throw new Error('注册信息不完整，credential.id 或 credential.publicKey 缺失');
        }
        const newCredential: Authenticator = {
            id: credential.id,
            name: credentialName,
            credentialID: Buffer.from(credential.id, 'base64url').toString('base64url'),
            credentialPublicKey: Buffer.from(credential.publicKey).toString('base64'),
            counter: credential.counter,
            createdAt: new Date().toISOString()
        };

        // 更新用户记录
        await UserStorage.updateUser(user.id, {
            passkeyEnabled: true,
            passkeyCredentials: [...(user.passkeyCredentials || []), newCredential],
            pendingChallenge: undefined
        });

        return verification;
    }

    // 生成认证选项
    public static async generateAuthenticationOptions(user: User) {
        if (!user) {
            throw new Error('用户对象为空');
        }
        
        await fixUserPasskeyCredentialIDs(user);
        const userAuthenticators = user.passkeyCredentials || [];
        
        if (userAuthenticators.length === 0) {
            throw new Error('用户没有注册的认证器');
        }
        
        // 确保所有credentialID都是有效的字符串
        const validCredentials = userAuthenticators.filter(cred => 
            cred && 
            typeof cred === 'object' && 
            typeof cred.credentialID === 'string' && 
            /^[A-Za-z0-9_-]+$/.test(cred.credentialID) && 
            cred.credentialID.length > 0
        );
        
        if (validCredentials.length === 0) {
            logger.error('[Passkey] 用户无有效Passkey凭证', { userId: user.id });
            throw new Error('所有Passkey已失效，请重新注册');
        }
        
        try {
            // 最终安全检查：确保所有credentialID都是有效的base64url字符串
            const finalValidCredentials = validCredentials.filter(cred => {
                const isValid = typeof cred.credentialID === 'string' && 
                               /^[A-Za-z0-9_-]+$/.test(cred.credentialID) && 
                               cred.credentialID.length > 0;
                
                if (!isValid) {
                    logger.warn('[Passkey] 发现无效credentialID，跳过', {
                        userId: user.id,
                        credentialID: cred.credentialID,
                        type: typeof cred.credentialID
                    });
                }
                
                return isValid;
            });
            
            if (finalValidCredentials.length === 0) {
                logger.error('[Passkey] 最终检查后无有效凭证', { userId: user.id });
                throw new Error('所有Passkey已失效，请重新注册');
            }
            
            logger.info('[Passkey] 准备生成认证选项', {
                userId: user.id,
                validCredentialsCount: finalValidCredentials.length,
                credentialIDs: finalValidCredentials.map(c => c.credentialID.substring(0, 10) + '...'),
                allowCredentials: finalValidCredentials.map(authenticator => ({
                    id: authenticator.credentialID.substring(0, 20) + '...',
                    type: 'public-key',
                    transports: ['internal']
                }))
            });
            
            // 确保allowCredentials格式正确
            const allowCredentials = finalValidCredentials.map(authenticator => {
                logger.info('[Passkey] 处理认证器:', {
                    userId: user.id,
                    credentialID: authenticator.credentialID.substring(0, 20) + '...',
                    credentialIDLength: authenticator.credentialID.length,
                    isValidBase64Url: /^[A-Za-z0-9_-]+$/.test(authenticator.credentialID)
                });
                
                return {
                    id: authenticator.credentialID,
                    transports: ['internal'] as any
                };
            });
            
            logger.info('[Passkey] 生成的allowCredentials:', {
                userId: user.id,
                count: allowCredentials.length,
                credentials: allowCredentials.map(cred => ({
                    id: cred.id.substring(0, 20) + '...',
                    transports: cred.transports,
                    fullId: cred.id
                })),
                fullAllowCredentials: JSON.stringify(allowCredentials, null, 2)
            });
            
            const options = await generateAuthenticationOptions({
                rpID: getRpId(),
                allowCredentials,
                userVerification: 'required'
            });
            
            logger.info('[Passkey] generateAuthenticationOptions返回结果:', {
                userId: user.id,
                hasOptions: !!options,
                optionsKeys: Object.keys(options || {}),
                challenge: options?.challenge?.substring(0, 20) + '...',
                allowCredentialsCount: options?.allowCredentials?.length || 0,
                fullOptions: JSON.stringify(options, null, 2)
            });
            
            // 存储挑战到用户记录
            await UserStorage.updateUser(user.id, {
                pendingChallenge: options.challenge
            });
            
            return options;
        } catch (err: any) {
            // 检查input.replace is not a function等类型错误，强制修复所有credentialID
            if (err && err.message && err.message.includes('replace is not a function')) {
                logger.warn('[Passkey自愈] 捕获到input.replace类型错误，强制修复所有credentialID并重试', {
                    userId: user.id,
                    error: err.message
                });
                
                // 再次尝试修复
                await fixUserPasskeyCredentialIDs(user);
                
                // 重新获取过滤后的 credentials
                const retryValidCredentials = user.passkeyCredentials?.filter(c => 
                    c && 
                    typeof c === 'object' && 
                    typeof c.credentialID === 'string' && 
                    /^[A-Za-z0-9_-]+$/.test(c.credentialID) && 
                    c.credentialID.length > 0
                );
                
                if (!retryValidCredentials || retryValidCredentials.length === 0) {
                    logger.error('[Passkey自愈] 修复后无可用Passkey，需重新注册', { userId: user.id });
                    throw new Error('所有Passkey已失效，请重新注册');
                }
                
                // 最终安全检查：确保所有credentialID都是有效的base64url字符串
                const finalRetryCredentials = retryValidCredentials.filter(cred => {
                    const isValid = typeof cred.credentialID === 'string' && 
                                   /^[A-Za-z0-9_-]+$/.test(cred.credentialID) && 
                                   cred.credentialID.length > 0;
                    
                    if (!isValid) {
                        logger.warn('[Passkey自愈] 重试时发现无效credentialID，跳过', {
                            userId: user.id,
                            credentialID: cred.credentialID,
                            type: typeof cred.credentialID
                        });
                    }
                    
                    return isValid;
                });
                
                if (finalRetryCredentials.length === 0) {
                    logger.error('[Passkey自愈] 重试时最终检查后无有效凭证', { userId: user.id });
                    throw new Error('所有Passkey已失效，请重新注册');
                }
                
                logger.info('[Passkey自愈] 重试生成认证选项', {
                    userId: user.id,
                    validCredentialsCount: finalRetryCredentials.length,
                    credentialIDs: finalRetryCredentials.map(c => c.credentialID.substring(0, 10) + '...')
                });
                
                // 再次尝试
                const options = await generateAuthenticationOptions({
                    rpID: getRpId(),
                    allowCredentials: finalRetryCredentials.map(authenticator => ({
                        id: authenticator.credentialID,
                        transports: ['internal']
                    })),
                    userVerification: 'required'
                });
                
                await UserStorage.updateUser(user.id, {
                    pendingChallenge: options.challenge
                });
                
                return options;
            }
            
            // 记录其他类型的错误
            logger.error('[Passkey] generateAuthenticationOptions 失败', {
                userId: user.id,
                error: err.message,
                stack: err.stack
            });
            
            throw err;
        }
    }

    // 验证认证
    public static async verifyAuthentication(
        user: User,
        response: any,
        requestOrigin?: string
    ): Promise<VerifiedAuthenticationResponse> {
        await fixUserPasskeyCredentialIDs(user);
        if (!user.pendingChallenge) {
            throw new Error('认证会话已过期');
        }

        const userAuthenticators = user.passkeyCredentials || [];
        
        // 提取credentialID，支持多种格式
        let responseIdBase64: string;
        
        // 详细记录响应对象结构
        logger.info('[Passkey] 认证响应对象结构', {
            userId: user.id,
            responseKeys: Object.keys(response),
            hasRawId: !!response.rawId,
            hasId: !!response.id,
            rawIdType: typeof response.rawId,
            idType: typeof response.id,
            responseType: typeof response.response,
            rawIdIsArray: Array.isArray(response.rawId)
        });
        
        if (response.rawId) {
            // 处理rawId，可能是ArrayBuffer或数组
            try {
                let buffer: Buffer;
                if (Array.isArray(response.rawId)) {
                    // 如果是数组，转换为Buffer
                    buffer = Buffer.from(response.rawId);
                    logger.info('[Passkey] 从数组rawId转换为Buffer', {
                        userId: user.id,
                        arrayLength: response.rawId.length,
                        bufferLength: buffer.length
                    });
                } else if (response.rawId instanceof ArrayBuffer) {
                    // 如果是ArrayBuffer，直接使用
                    buffer = Buffer.from(response.rawId);
                } else {
                    // 其他情况，尝试转换
                    buffer = Buffer.from(response.rawId);
                }
                
                responseIdBase64 = isoBase64URL.fromBuffer(buffer);
                logger.info('[Passkey] 从rawId提取credentialID成功', {
                    userId: user.id,
                    rawIdLength: buffer.length,
                    extractedId: responseIdBase64.substring(0, 10) + '...',
                    fullId: responseIdBase64
                });
            } catch (error) {
                logger.error('[Passkey] 从rawId提取credentialID失败', {
                    userId: user.id,
                    error: error instanceof Error ? error.message : String(error),
                    rawIdType: typeof response.rawId,
                    rawIdIsArray: Array.isArray(response.rawId),
                    rawIdLength: Array.isArray(response.rawId) ? response.rawId.length : response.rawId?.byteLength
                });
                throw new Error('从rawId提取credentialID失败: ' + (error instanceof Error ? error.message : String(error)));
            }
        } else if (response.id) {
            // 如果直接有id字段（base64url字符串），直接使用
            responseIdBase64 = response.id;
            logger.info('[Passkey] 直接使用id字段', {
                userId: user.id,
                idLength: response.id.length,
                id: response.id.substring(0, 10) + '...',
                idValue: response.id
            });
        } else {
            // 如果都没有，记录错误信息
            logger.error('[Passkey] 认证响应中缺少credentialID', {
                userId: user.id,
                responseKeys: Object.keys(response),
                response: JSON.stringify(response, null, 2),
                responseType: typeof response,
                hasRawId: !!response.rawId,
                hasId: !!response.id,
                hasResponse: !!response.response,
                rawIdType: typeof response.rawId,
                rawIdIsArray: Array.isArray(response.rawId)
            });
            throw new Error('认证响应中缺少credentialID');
        }
        
        logger.info('[Passkey] 提取到credentialID', {
            userId: user.id,
            responseIdBase64: responseIdBase64.substring(0, 10) + '...',
            hasRawId: !!response.rawId,
            hasId: !!response.id
        });
        
        const authenticator = userAuthenticators.find(
            auth => auth.credentialID === responseIdBase64
        );

        if (!authenticator) {
            // 新增详细错误信息，便于前后端比对
            const allCredentialIDs = userAuthenticators.map(a => a.credentialID);
            logger.error('[Passkey] 找不到匹配的认证器', {
                userId: user.id,
                responseIdBase64: responseIdBase64.substring(0, 20) + '...',
                allCredentialIDs: allCredentialIDs.map(id => id.substring(0, 10) + '...'),
                responseKeys: Object.keys(response)
            });
            throw new Error(`找不到匹配的认证器 | 前端credentialID: ${responseIdBase64} | 后端credentialID列表: ${JSON.stringify(allCredentialIDs)}`);
        }

        let verification: VerifiedAuthenticationResponse;
        try {
            verification = await verifyAuthenticationResponse({
                response,
                expectedChallenge: user.pendingChallenge,
                expectedOrigin: requestOrigin || getRpOrigin(),
                expectedRPID: getRpId(),
                authenticator: {
                    credentialID: Buffer.from(authenticator.credentialID, 'base64url'),
                    credentialPublicKey: Buffer.from(authenticator.credentialPublicKey, 'base64'),
                    counter: authenticator.counter
                } as any
            } as any);
        } catch (error) {
            logger.error('验证认证响应失败:', error);
            throw new Error('验证认证响应失败');
        }

        if (verification.verified) {
            // 更新认证器计数器
            const updatedCredentials = userAuthenticators.map(cred =>
                cred.credentialID === responseIdBase64
                    ? { ...cred, counter: verification.authenticationInfo.newCounter }
                    : cred
            );

            // 更新用户记录
            await UserStorage.updateUser(user.id, {
                passkeyCredentials: updatedCredentials,
                pendingChallenge: undefined
            });
        }

        return verification;
    }

    // 删除认证器
    public static async removeCredential(userId: string, credentialId: string): Promise<void> {
        const user = await UserStorage.getUserById(userId);
        if (user) {
            await fixUserPasskeyCredentialIDs(user);
        }
        if (!user || !user.passkeyCredentials) {
            throw new Error('用户不存在或没有认证器');
        }

        const updatedCredentials = user.passkeyCredentials.filter(
            auth => auth.id !== credentialId
        );

        if (updatedCredentials.length === user.passkeyCredentials.length) {
            throw new Error('找不到指定的认证器');
        }

        // 更新用户记录
        await UserStorage.updateUser(userId, {
            passkeyCredentials: updatedCredentials,
            passkeyEnabled: updatedCredentials.length > 0
        });
    }

    // 生成访问令牌
    public static async generateToken(user: User): Promise<string> {
        return jwt.sign(
            { userId: user.id, username: user.username },
            config.jwtSecret,
            { expiresIn: '24h' }
        );
    }
} 