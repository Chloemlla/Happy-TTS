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
    const rpId = process.env.RP_ID || 'localhost';
    return rpId;
};

// 获取 RP 原点
const getRpOrigin = () => {
    return process.env.RP_ORIGIN || 'http://localhost:3001';
};

export class PasskeyService {
    // 获取用户的认证器列表
    public static async getCredentials(userId: string): Promise<Authenticator[]> {
        const user = await UserStorage.getUserById(userId);
                if (!user || !user.passkeyCredentials) {
            return [];
        }
        
        return user.passkeyCredentials;
    }

    // 生成注册选项
    public static async generateRegistrationOptions(user: User, credentialName: string) {
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
            credentialID: credential.id,
            credentialPublicKey: Buffer.from(credential.publicKey).toString('base64'),
            counter: credential.counter,
            createdAt: new Date().toISOString()
        };

        // 更新用户记录
        await UserStorage.updateUser(user.id, {
            passkeyEnabled: true,
            passkeyCredentials: [...(user.passkeyCredentials || []), newCredential],
            currentChallenge: undefined
        });

        return verification;
    }

    // 生成认证选项
    public static async generateAuthenticationOptions(user: User) {
        const userAuthenticators = user.passkeyCredentials || [];
        if (userAuthenticators.length === 0) {
            throw new Error('用户没有注册的认证器');
        }

        const options = await generateAuthenticationOptions({
            rpID: getRpId(),
            allowCredentials: userAuthenticators.map(authenticator => ({
                id: Buffer.from(authenticator.credentialID, 'base64'),
                type: 'public-key',
                transports: ['internal']
            } as any)),
            userVerification: 'required'
        });

        // 存储挑战到用户记录
        await UserStorage.updateUser(user.id, {
            pendingChallenge: options.challenge
        });

        return options;
    }

    // 验证认证
    public static async verifyAuthentication(
        user: User,
        response: any,
        requestOrigin?: string
    ): Promise<VerifiedAuthenticationResponse> {
        if (!user.pendingChallenge) {
            throw new Error('认证会话已过期');
        }

        const userAuthenticators = user.passkeyCredentials || [];
        const authenticator = userAuthenticators.find(
            auth => auth.id === response.id
        );

        if (!authenticator) {
            throw new Error('找不到匹配的认证器');
        }

        let verification: VerifiedAuthenticationResponse;
        try {
            verification = await verifyAuthenticationResponse({
                response,
                expectedChallenge: user.pendingChallenge,
                expectedOrigin: requestOrigin || getRpOrigin(),
                expectedRPID: getRpId(),
                authenticator: {
                    credentialID: Buffer.from(authenticator.credentialID, 'base64'),
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
                cred.id === authenticator.id
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