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
    const rpId = getRpId();
    const isSecure = process.env.NODE_ENV === 'production';
    return `${isSecure ? 'https' : 'http'}://${rpId}`;
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
                const userAuthenticators = user.passkeyCredentials || [];
        
        const options = await generateRegistrationOptions({
            rpName: 'Synapse',
            rpID: getRpId(),
            userID: Buffer.from(user.id),
            userName: user.username,
            attestationType: 'none',
            authenticatorSelection: {
                authenticatorAttachment: 'platform', // 使用平台认证器（指纹、面容等）
                requireResidentKey: true, // 要求认证器存储凭证
                userVerification: 'required' // 要求用户验证（生物识别）
            },
            excludeCredentials: userAuthenticators.map(authenticator => ({
                id: authenticator.credentialID,
                type: 'public-key',
                transports: ['internal']
            } as any))
        });

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
        credentialName: string
    ): Promise<VerifiedRegistrationResponse> {
        if (!user.pendingChallenge) {
            throw new Error('注册会话已过期');
        }

        let verification: VerifiedRegistrationResponse;
        try {
            verification = await verifyRegistrationResponse({
                response,
                expectedChallenge: user.pendingChallenge,
                expectedOrigin: getRpOrigin(),
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

        const existingCredentials = user.passkeyCredentials || [];
        const newCredential: Authenticator = {
            id: (registrationInfo as any).credentialID.toString('base64'),
            name: credentialName,
            credentialID: (registrationInfo as any).credentialID.toString('base64'),
            credentialPublicKey: (registrationInfo as any).credentialPublicKey.toString('base64'),
            counter: (registrationInfo as any).counter,
            createdAt: new Date().toISOString()
        };

        // 更新用户记录
        await UserStorage.updateUser(user.id, {
            passkeyEnabled: true,
            passkeyCredentials: [...existingCredentials, newCredential],
            pendingChallenge: undefined
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
        response: any
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
                expectedOrigin: getRpOrigin(),
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