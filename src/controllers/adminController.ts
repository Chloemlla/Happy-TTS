import { Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import logger from '../utils/logger';

const USERS_FILE = path.join(process.cwd(), 'data/users.json');

// Define a User type for type safety
interface User {
  id: string;
  username: string;
  email: string;
  password?: string; // Password might not always be present
  role: 'user' | 'admin';
  createdAt: string;
  dailyUsage: number;
  lastUsageDate: string;
  token?: string;
  tokenExpiresAt?: string;
}

async function readUsers(): Promise<User[]> {
    try {
        if (!fs.existsSync(USERS_FILE)) return [];
        const data = await fs.promises.readFile(USERS_FILE, 'utf-8');
        return JSON.parse(data);
    } catch (error) {
        logger.error('读取用户文件失败:', error);
        return [];
    }
}

async function writeUsers(users: User[]): Promise<void> {
    try {
        await fs.promises.writeFile(USERS_FILE, JSON.stringify(users, null, 2));
    } catch (error) {
        logger.error('写入用户文件失败:', error);
        throw error;
    }
}

export const adminController = {
    getUsers: async (req: Request, res: Response) => {
        try {
            const users = await readUsers();
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
            const users = await readUsers();
            const { username, email, password, role } = req.body;
            
            if (!username || !email || !password) {
                return res.status(400).json({ error: '参数不全' });
            }
            
            if (users.find((u: User) => u.username === username)) {
                return res.status(400).json({ error: '用户名已存在' });
            }
            
            const user: User = { 
                id: uuidv4(), 
                username, 
                email, 
                password, 
                role, 
                createdAt: new Date().toISOString(), 
                dailyUsage: 0, 
                lastUsageDate: new Date().toISOString() 
            };
            
            users.push(user);
            await writeUsers(users);
            
            const { password: _, ...newUser } = user;
            res.status(201).json(newUser);
        } catch (error) {
            logger.error('创建用户失败:', error);
            res.status(500).json({ error: '创建用户失败' });
        }
    },
    
    updateUser: async (req: Request, res: Response) => {
        try {
            const users = await readUsers();
            const idx = users.findIndex((u: User) => u.id === req.params.id);
            
            if (idx === -1) {
                return res.status(404).json({ error: '用户不存在' });
            }
            
            const { username, email, password, role } = req.body;
            
            // 保留现有密码（如果请求中没有提供新密码）
            const newPassword = password || users[idx].password;

            if (!username || !email || !role) {
                return res.status(400).json({ error: '参数不全' });
            }
            
            users[idx] = { ...users[idx], username, email, password: newPassword, role };
            await writeUsers(users);
            
            const { password: _, ...updatedUser } = users[idx];
            res.json(updatedUser);
        } catch (error) {
            logger.error('更新用户失败:', error);
            res.status(500).json({ error: '更新用户失败' });
        }
    },
    
    deleteUser: async (req: Request, res: Response) => {
        try {
            let users = await readUsers();
            const userToDelete = users.find((u: User) => u.id === req.params.id);
            
            if (!userToDelete) {
                return res.status(404).json({ error: '用户不存在' });
            }
            
            users = users.filter((u: User) => u.id !== req.params.id);
            await writeUsers(users);
            
            const { password, ...deletedUser } = userToDelete;
            res.json(deletedUser);
        } catch (error) {
            logger.error('删除用户失败:', error);
            res.status(500).json({ error: '删除用户失败' });
        }
    }
}; 