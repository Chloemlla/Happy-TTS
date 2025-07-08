import request from 'supertest';
import app from '../app';
import { UserStorage } from '../utils/userStorage';
import jwt from 'jsonwebtoken';
import { config } from '../config/config';

describe('TOTP认证修复测试', () => {
    let testUser: any;
    let validToken: string;

    beforeEach(async () => {
        // 清理测试数据 - 更彻底的清理
        try {
            const allUsers = await UserStorage.getAllUsers();
            const existingUsers = allUsers.filter(u => 
                u.username === 'testuser_totp_fix' || 
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
        testUser = await UserStorage.createUser('testuser_totp_fix', 'test@example.com', 'password123');
        if (!testUser) {
            throw new Error('创建测试用户失败');
        }

        // 生成有效的JWT token
        validToken = jwt.sign(
            { userId: testUser.id, username: testUser.username },
            config.jwtSecret,
            { expiresIn: '24h' }
        );
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

    it('应该正确解析JWT token并获取TOTP状态', async () => {
        const response = await request(app)
            .get('/api/totp/status')
            .set('Authorization', `Bearer ${validToken}`)
            .expect(200);

        expect(response.body).toHaveProperty('enabled');
        expect(response.body).toHaveProperty('hasBackupCodes');
        expect(response.body.enabled).toBe(false);
        expect(response.body.hasBackupCodes).toBe(false);
    });

    it('应该拒绝无效的JWT token', async () => {
        const invalidToken = 'invalid.jwt.token';
        
        const response = await request(app)
            .get('/api/totp/status')
            .set('Authorization', `Bearer ${invalidToken}`)
            .expect(401);

        expect(response.body).toHaveProperty('error');
        expect(response.body.error).toContain('Token');
    });

    it('应该拒绝过期的JWT token', async () => {
        const expiredToken = jwt.sign(
            { userId: testUser.id, username: testUser.username },
            config.jwtSecret,
            { expiresIn: '0s' }
        );

        const response = await request(app)
            .get('/api/totp/status')
            .set('Authorization', `Bearer ${expiredToken}`)
            .expect(401);

        expect(response.body).toHaveProperty('error');
        expect(response.body.error).toContain('Token');
    });

    it('应该拒绝没有Authorization header的请求', async () => {
        const response = await request(app)
            .get('/api/totp/status')
            .expect(401);

        expect(response.body).toHaveProperty('error');
        expect(response.body.error).toBe('未授权');
    });

    it('应该拒绝格式错误的Authorization header', async () => {
        const response = await request(app)
            .get('/api/totp/status')
            .set('Authorization', 'InvalidFormat')
            .expect(401);

        expect(response.body).toHaveProperty('error');
        expect(response.body.error).toBe('未授权');
    });

    it('应该正确处理TOTP生成设置请求', async () => {
        const response = await request(app)
            .post('/api/totp/generate-setup')
            .set('Authorization', `Bearer ${validToken}`)
            .expect(200);

        expect(response.body).toHaveProperty('secret');
        expect(response.body).toHaveProperty('otpauthUrl');
        expect(response.body).toHaveProperty('qrCodeDataUrl');
        expect(response.body).toHaveProperty('backupCodes');
        expect(response.body).toHaveProperty('message');
    });

    it('应该拒绝不存在的用户ID', async () => {
        const nonExistentToken = jwt.sign(
            { userId: 'non-existent-id', username: 'nonexistent' },
            config.jwtSecret,
            { expiresIn: '24h' }
        );

        const response = await request(app)
            .get('/api/totp/status')
            .set('Authorization', `Bearer ${nonExistentToken}`)
            .expect(403);

        expect(response.body).toHaveProperty('error');
        expect(response.body.error).toBe('无效的Token');
    });
}); 