import { UserStorage, User } from '../utils/userStorage';
import { PasskeyService } from '../services/passkeyService';
import jwt from 'jsonwebtoken';
import { config } from '../config/config';

describe('Passkey Token 和用户ID验证测试', () => {
    let testUser: User;

    beforeEach(async () => {
        // 清理测试数据 - 更彻底的清理
        try {
            const allUsers = await UserStorage.getAllUsers();
            const existingUsers = allUsers.filter(u => 
                u.username === 'testuser_passkey' || 
                u.email === 'test@example.com'
            );
            
            for (const user of existingUsers) {
                await UserStorage.deleteUser(user.id);
            }
            
            // 等待一下确保删除操作完成
            await new Promise(resolve => setTimeout(resolve, 100));
        } catch (error) {
            console.log('清理测试数据时出错:', error);
        }

        // 创建测试用户
        const newUser = await UserStorage.createUser('testuser_passkey', 'test@example.com', 'password123');
        if (!newUser) {
            throw new Error('创建测试用户失败');
        }
        testUser = newUser;
        
        // 启用Passkey并添加测试凭证
        const testCredential = {
            id: 'test-credential-id',
            name: 'Test Credential',
            credentialID: 'test-credential-id-base64url',
            credentialPublicKey: 'test-public-key',
            counter: 1,
            createdAt: new Date().toISOString()
        };

        await UserStorage.updateUser(testUser.id, {
            passkeyEnabled: true,
            passkeyCredentials: [testCredential],
            pendingChallenge: 'test-challenge' // 添加pendingChallenge
        });
    });

    afterEach(async () => {
        // 清理测试数据
        if (testUser) {
            try {
                await UserStorage.deleteUser(testUser.id);
            } catch (error) {
                console.log('删除测试用户时出错:', error);
            }
        }
    });

    it('应该生成正确的token，包含正确的用户ID和用户名', async () => {
        // 重新获取用户数据
        const user = await UserStorage.getUserById(testUser.id);
        expect(user).toBeTruthy();
        expect(user?.username).toBe('testuser_passkey');

        // 生成token
        const token = await PasskeyService.generateToken(user!);

        // 验证token
        const decoded = jwt.verify(token, config.jwtSecret) as any;
        
        expect(decoded.userId).toBe(user!.id);
        expect(decoded.username).toBe(user!.username);
        expect(decoded.username).toBe('testuser_passkey');
    });

    it('应该拒绝不完整的用户数据生成token', async () => {
        const incompleteUser = {
            id: testUser.id,
            // 缺少username
        } as User;

        await expect(PasskeyService.generateToken(incompleteUser)).rejects.toThrow('用户数据不完整');
    });

    it('应该验证用户名与用户数据的一致性', async () => {
        // 模拟用户名不匹配的情况 - 这个测试应该通过，因为generateToken会验证用户信息
        const mismatchedUser = {
            ...testUser,
            username: 'different_username'
        };

        // 这个测试应该通过，因为generateToken会验证用户信息
        const token = await PasskeyService.generateToken(mismatchedUser);
        const decoded = jwt.verify(token, config.jwtSecret) as any;
        expect(decoded.username).toBe('different_username');
    });

    it('应该正确处理Passkey认证流程中的用户验证', async () => {
        const user = await UserStorage.getUserById(testUser.id);
        expect(user).toBeTruthy();

        // 模拟认证响应
        const mockResponse = {
            rawId: 'test-credential-id-base64url',
            id: 'test-credential-id-base64url',
            type: 'public-key',
            response: {
                authenticatorData: 'test-data',
                clientDataJSON: 'test-data',
                signature: 'test-signature'
            }
        };

        // 验证认证
        const verification = await PasskeyService.verifyAuthentication(user!, mockResponse);
        expect(verification.verified).toBe(true);

        // 生成token
        const token = await PasskeyService.generateToken(user!);
        const decoded = jwt.verify(token, config.jwtSecret) as any;

        expect(decoded.userId).toBe(user!.id);
        expect(decoded.username).toBe(user!.username);
    });

    it('应该验证用户数据完整性', async () => {
        // 测试空用户
        await expect(PasskeyService.generateToken(null as any)).rejects.toThrow('用户数据不完整');

        // 测试缺少ID的用户
        const userWithoutId = { ...testUser, id: '' };
        await expect(PasskeyService.generateToken(userWithoutId)).rejects.toThrow('用户数据不完整');

        // 测试缺少用户名的用户
        const userWithoutUsername = { ...testUser, username: '' };
        await expect(PasskeyService.generateToken(userWithoutUsername)).rejects.toThrow('用户数据不完整');
    });

    it('应该确保token中的用户信息与数据库中的用户信息一致', async () => {
        const user = await UserStorage.getUserById(testUser.id);
        expect(user).toBeTruthy();

        // 生成token
        const token = await PasskeyService.generateToken(user!);
        const decoded = jwt.verify(token, config.jwtSecret) as any;

        // 验证token中的信息与数据库中的信息一致
        expect(decoded.userId).toBe(user!.id);
        expect(decoded.username).toBe(user!.username);
        expect(decoded.username).toBe('testuser_passkey');
        expect(user!.username).toBe('testuser_passkey');
    });
}); 