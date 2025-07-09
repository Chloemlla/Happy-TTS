import { Request, Response } from 'express';
import { UserStorage } from '../utils/userStorage';
import { v4 as uuidv4 } from 'uuid';
import logger from '../utils/logger';

export const adminController = {
    getUsers: async (req: Request, res: Response) => {
        try {
            const users = await UserStorage.getAllUsers();
            const usersWithoutPassword = users.map(user => {
                const { password, ...userWithoutPassword } = user;
                return userWithoutPassword;
            });
            res.json(usersWithoutPassword);
        } catch (error) {
            logger.error('获取用户列表失败:', error);
            res.status(500).json({ error: '获取用户列表失败' });
        }
    },
    
    createUser: async (req: Request, res: Response) => {
        try {
            const { username, email, password, role } = req.body;
            if (!username || !email || !password) {
                return res.status(400).json({ error: '参数不全' });
            }
            const exist = await UserStorage.getUserByUsername(username);
            if (exist) {
                return res.status(400).json({ error: '用户名已存在' });
            }
            const user = await UserStorage.createUser(username, email, password);
            if (user && role) {
                await UserStorage.updateUser(user.id, { role });
            }
            const { password: _, ...newUser } = user || {};
            res.status(201).json(newUser);
        } catch (error) {
            logger.error('创建用户失败:', error);
            res.status(500).json({ error: '创建用户失败' });
        }
    },
    
    updateUser: async (req: Request, res: Response) => {
        try {
            const { username, email, password, role } = req.body;
            if (!username || !email || !role) {
                return res.status(400).json({ error: '参数不全' });
            }
            const user = await UserStorage.getUserById(req.params.id);
            if (!user) {
                return res.status(404).json({ error: '用户不存在' });
            }
            const newPassword = password || user.password;
            const updated = await UserStorage.updateUser(user.id, { username, email, password: newPassword, role });
            const { password: _, ...updatedUser } = updated || {};
            res.json(updatedUser);
        } catch (error) {
            logger.error('更新用户失败:', error);
            res.status(500).json({ error: '更新用户失败' });
        }
    },
    
    deleteUser: async (req: Request, res: Response) => {
        try {
            const user = await UserStorage.getUserById(req.params.id);
            if (!user) {
                return res.status(404).json({ error: '用户不存在' });
            }
            await UserStorage.deleteUser(user.id);
            const { password, ...deletedUser } = user;
            res.json(deletedUser);
        } catch (error) {
            logger.error('删除用户失败:', error);
            res.status(500).json({ error: '删除用户失败' });
        }
    }
}; 