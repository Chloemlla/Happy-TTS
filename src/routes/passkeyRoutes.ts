import express from 'express';
import { PasskeyService } from '../services/passkeyService';
import { authenticateToken } from '../middleware/authenticateToken';
import { UserStorage, User } from '../utils/userStorage';

const router = express.Router();

// 获取用户的 Passkey 凭证列表
router.get('/credentials', authenticateToken, async (req, res) => {
    try {
        const userId = (req as any).user.id;
        const credentials = await PasskeyService.getCredentials(userId);
        res.json(credentials);
    } catch (error) {
        console.error('获取 Passkey 凭证列表失败:', error);
        res.status(500).json({ error: '获取 Passkey 凭证列表失败' });
    }
});

// 开始注册 Passkey
router.post('/register/start', authenticateToken, async (req, res) => {
    try {
        const userId = (req as any).user?.id;
        const { credentialName } = req.body;
        console.log('[Passkey] /register/start userId:', userId, 'credentialName:', credentialName);

        if (!credentialName || typeof credentialName !== 'string') {
            console.warn('[Passkey] 缺少或无效的 credentialName:', credentialName);
            return res.status(400).json({ error: '认证器名称是必需的', details: 'credentialName 缺失或类型错误' });
        }

        const user = await UserStorage.getUserById(userId);
        console.log('[Passkey] /register/start user:', user);
        if (!user) {
            console.warn('[Passkey] 用户不存在:', userId);
            return res.status(404).json({ error: '用户不存在', details: 'userId: ' + userId });
        }

        let options;
        try {
            options = await PasskeyService.generateRegistrationOptions(user, credentialName);
        } catch (err) {
            console.error('[Passkey] generateRegistrationOptions error:', err);
            return res.status(500).json({ error: '生成注册选项失败', details: err instanceof Error ? err.message : String(err) });
        }
        console.log('[Passkey] /register/start options:', options);
        if (!options) {
            return res.status(500).json({ error: '生成注册选项失败', details: 'options 为 undefined' });
        }
        if (!options.challenge) {
            return res.status(500).json({ error: '生成注册选项失败', details: 'options.challenge 为 undefined' });
        }

        await UserStorage.updateUser(userId, {
            currentChallenge: options.challenge
        });

        res.json({ options });
    } catch (error) {
        console.error('生成 Passkey 注册选项失败:', error);
        res.status(500).json({ error: '生成 Passkey 注册选项失败', details: error instanceof Error ? error.message : String(error) });
    }
});

// 完成注册 Passkey
router.post('/register/finish', authenticateToken, async (req, res) => {
    try {
        const userId = (req as any).user.id;
        const { credentialName, response } = req.body;
        if (!credentialName || !response) {
            return res.status(400).json({ error: '认证器名称和响应是必需的' });
        }
        const user = await UserStorage.getUserById(userId);
        if (!user) {
            return res.status(404).json({ error: '用户不存在' });
        }
        // 自动获取请求origin
        const requestOrigin = req.headers.origin || req.headers.referer || 'http://localhost:3001';
        const verification = await PasskeyService.verifyRegistration(user, response, credentialName, requestOrigin);
        res.json(verification);
    } catch (error) {
        console.error('完成 Passkey 注册失败:', error);
        res.status(500).json({ error: '完成 Passkey 注册失败' });
    }
});

// 开始认证
router.post('/authenticate/start', async (req, res) => {
    try {
        const { username } = req.body;

        if (!username) {
            return res.status(400).json({ error: '用户名是必需的' });
        }

        const user = await UserStorage.getUserByUsername(username);
        if (!user) {
            return res.status(404).json({ error: '用户不存在' });
        }

        if (!user.passkeyEnabled || !user.passkeyCredentials || user.passkeyCredentials.length === 0) {
            return res.status(400).json({ error: '用户未启用 Passkey 或没有注册的凭证' });
        }

        const options = await PasskeyService.generateAuthenticationOptions(user);
        
        // 保存 challenge 到用户数据中
        await UserStorage.updateUser(user.id, {
            currentChallenge: options.challenge
        });

        res.json({ options });
    } catch (error) {
        console.error('生成 Passkey 认证选项失败:', error);
        res.status(500).json({ error: '生成 Passkey 认证选项失败' });
    }
});

// 完成认证
router.post('/authenticate/finish', async (req, res) => {
    try {
        const { username, response } = req.body;
        if (!username || !response) {
            return res.status(400).json({ error: '用户名和响应是必需的' });
        }
        const user = await UserStorage.getUserByUsername(username);
        if (!user) {
            return res.status(404).json({ error: '用户不存在' });
        }
        // 自动获取请求origin
        const requestOrigin = req.headers.origin || req.headers.referer || 'http://localhost:3001';
        const verification = await PasskeyService.verifyAuthentication(user, response, requestOrigin);
        const token = await PasskeyService.generateToken(user);
        res.json({
            success: true,
            token: token,
            user: { id: user.id, username: user.username }
        });
    } catch (error) {
        console.error('完成 Passkey 认证失败:', error);
        res.status(500).json({ error: '完成 Passkey 认证失败' });
    }
});

// 删除 Passkey 凭证
router.delete('/credentials/:credentialId', authenticateToken, async (req, res) => {
    try {
        const userId = (req as any).user.id;
        const { credentialId } = req.params;

        if (!credentialId) {
            return res.status(400).json({ error: '凭证ID是必需的' });
        }

        await PasskeyService.removeCredential(userId, credentialId);
        res.json({ success: true });
    } catch (error) {
        console.error('删除 Passkey 凭证失败:', error);
        res.status(500).json({ error: '删除 Passkey 凭证失败' });
    }
});

export default router; 