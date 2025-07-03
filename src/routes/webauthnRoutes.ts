import { Router } from 'express';
import { authMiddleware } from '../middleware/authMiddleware';
import { WebAuthnService } from '../services/webauthnService';
import { UserStorage } from '../utils/userStorage';
import logger from '../utils/logger';

const router = Router();

// 获取用户的认证器列表
router.get('/credentials', authMiddleware, async (req, res) => {
    try {
        const userId = req.user?.id;
        if (!userId) {
            return res.status(401).json({ error: '未授权' });
        }

        const credentials = await WebAuthnService.getCredentials(userId);
        res.json({ credentials });
    } catch (error) {
        logger.error('获取认证器列表失败:', error);
        res.status(500).json({ error: '获取认证器列表失败' });
    }
});

// 生成注册选项
router.post('/generate-registration-options', authMiddleware, async (req, res) => {
    try {
        const userId = req.user?.id;
        const { credentialName } = req.body;

        if (!userId) {
            return res.status(401).json({ error: '未授权' });
        }

        if (!credentialName) {
            return res.status(400).json({ error: '认证器名称不能为空' });
        }

        const user = await UserStorage.getUserById(userId);
        if (!user) {
            return res.status(404).json({ error: '用户不存在' });
        }

        const options = await WebAuthnService.generateRegistrationOptions(user, credentialName);
        res.json(options);
    } catch (error) {
        logger.error('生成注册选项失败:', error);
        res.status(500).json({ error: '生成注册选项失败' });
    }
});

// 验证注册
router.post('/verify-registration', authMiddleware, async (req, res) => {
    try {
        const userId = req.user?.id;
        const { attResp, credentialName } = req.body;

        if (!userId) {
            return res.status(401).json({ error: '未授权' });
        }

        const user = await UserStorage.getUserById(userId);
        if (!user) {
            return res.status(404).json({ error: '用户不存在' });
        }

        const verification = await WebAuthnService.verifyRegistration(user, attResp, credentialName);
        res.json(verification);
    } catch (error) {
        logger.error('验证注册失败:', error);
        res.status(500).json({ error: '验证注册失败' });
    }
});

// 生成认证选项
router.post('/generate-authentication-options', async (req, res) => {
    try {
        const { username } = req.body;

        if (!username) {
            return res.status(400).json({ error: '用户名不能为空' });
        }

        const user = await UserStorage.getUserByUsername(username);
        if (!user) {
            return res.status(404).json({ error: '用户不存在' });
        }

        const options = await WebAuthnService.generateAuthenticationOptions(user);
        res.json(options);
    } catch (error) {
        logger.error('生成认证选项失败:', error);
        res.status(500).json({ error: '生成认证选项失败' });
    }
});

// 验证认证
router.post('/verify-authentication', async (req, res) => {
    try {
        const { username, authResp } = req.body;

        if (!username || !authResp) {
            return res.status(400).json({ error: '参数不完整' });
        }

        const user = await UserStorage.getUserByUsername(username);
        if (!user) {
            return res.status(404).json({ error: '用户不存在' });
        }

        const verification = await WebAuthnService.verifyAuthentication(user, authResp);
        if (verification.verified) {
            // 生成新的访问令牌
            const token = await WebAuthnService.generateToken(user);
            res.json({ verified: true, token });
        } else {
            res.json({ verified: false });
        }
    } catch (error) {
        logger.error('验证认证失败:', error);
        res.status(500).json({ error: '验证认证失败' });
    }
});

// 删除认证器
router.delete('/credentials/:credentialId', authMiddleware, async (req, res) => {
    try {
        const userId = req.user?.id;
        const { credentialId } = req.params;

        if (!userId) {
            return res.status(401).json({ error: '未授权' });
        }

        await WebAuthnService.removeCredential(userId, credentialId);
        res.json({ success: true });
    } catch (error) {
        logger.error('删除认证器失败:', error);
        res.status(500).json({ error: '删除认证器失败' });
    }
});

export default router; 