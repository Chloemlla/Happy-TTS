import fs from 'fs';
import path from 'path';
import logger from './logger';
import dotenv from 'dotenv';
import { config } from '../config/config';

// 加载环境变量
dotenv.config();

export interface User {
    id: string;
    username: string;
    email: string;
    password: string;
    role: 'user' | 'admin';
    dailyUsage: number;
    lastUsageDate: string;
    createdAt: string;
}

export class UserStorage {
    private static readonly USERS_FILE = path.join(process.cwd(), 'data', 'users.json');
    private static readonly DAILY_LIMIT = 5;

    private static ensureUsersFile() {
        try {
            const dir = path.dirname(this.USERS_FILE);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
                logger.info('创建用户数据目录', { dir });
            }

            if (!fs.existsSync(this.USERS_FILE)) {
                // 从环境变量获取管理员配置
                const adminUsername = config.adminUsername;
                const adminPassword = config.adminPassword;
                const adminEmail = `${adminUsername}@example.com`;

                // 创建默认管理员账户
                const defaultAdmin: User = {
                    id: '1',
                    username: adminUsername,
                    email: adminEmail,
                    password: adminPassword,
                    role: 'admin',
                    dailyUsage: 0,
                    lastUsageDate: new Date().toISOString(),
                    createdAt: new Date().toISOString()
                };

                fs.writeFileSync(this.USERS_FILE, JSON.stringify([defaultAdmin], null, 2));
                logger.info('已创建默认管理员账户', {
                    username: adminUsername,
                    email: adminEmail,
                    filePath: this.USERS_FILE
                });
            }
        } catch (error) {
            logger.error('初始化用户数据文件失败:', {
                error,
                filePath: this.USERS_FILE
            });
            throw new Error('初始化用户数据文件失败');
        }
    }

    private static readUsers(): User[] {
        try {
            this.ensureUsersFile();
            const data = fs.readFileSync(this.USERS_FILE, 'utf-8');
            return JSON.parse(data);
        } catch (error) {
            logger.error('读取用户数据失败:', {
                error,
                filePath: this.USERS_FILE
            });
            throw new Error('读取用户数据失败');
        }
    }

    private static writeUsers(users: User[]) {
        try {
            const tempFile = `${this.USERS_FILE}.tmp`;
            fs.writeFileSync(tempFile, JSON.stringify(users, null, 2));
            fs.renameSync(tempFile, this.USERS_FILE);
        } catch (error) {
            logger.error('写入用户数据失败:', {
                error,
                filePath: this.USERS_FILE
            });
            throw new Error('写入用户数据失败');
        }
    }

    public static async getAllUsers(): Promise<User[]> {
        try {
            return this.readUsers();
        } catch (error) {
            logger.error('获取所有用户失败:', error);
            throw error;
        }
    }

    public static async createUser(username: string, email: string, password: string): Promise<User | null> {
        try {
            const users = this.readUsers();
            
            // 检查用户名和邮箱是否已存在
            if (users.some(u => u.username === username || u.email === email)) {
                return null;
            }

            const newUser: User = {
                id: (users.length + 1).toString(),
                username,
                email,
                password,
                role: 'user',
                dailyUsage: 0,
                lastUsageDate: new Date().toISOString(),
                createdAt: new Date().toISOString()
            };

            users.push(newUser);
            this.writeUsers(users);
            return newUser;
        } catch (error) {
            logger.error('创建用户失败:', {
                error,
                username,
                email
            });
            throw error;
        }
    }

    public static async authenticateUser(identifier: string, password: string): Promise<User | null> {
        try {
            const users = this.readUsers();
            return users.find(u => 
                (u.username === identifier || u.email === identifier) && 
                u.password === password
            ) || null;
        } catch (error) {
            logger.error('用户认证失败:', {
                error,
                identifier
            });
            throw error;
        }
    }

    public static async getUserById(id: string): Promise<User | null> {
        try {
            const users = this.readUsers();
            return users.find(u => u.id === id) || null;
        } catch (error) {
            logger.error('获取用户信息失败:', {
                error,
                userId: id
            });
            throw error;
        }
    }

    public static async incrementUsage(userId: string): Promise<boolean> {
        try {
            const users = this.readUsers();
            const userIndex = users.findIndex(u => u.id === userId);
            
            if (userIndex === -1) return false;

            const user = users[userIndex];
            const today = new Date().toISOString().split('T')[0];
            const lastUsageDate = new Date(user.lastUsageDate).toISOString().split('T')[0];

            // 如果是新的一天，重置使用次数
            if (today !== lastUsageDate) {
                user.dailyUsage = 0;
                user.lastUsageDate = new Date().toISOString();
            }

            // 管理员不受使用限制
            if (user.role === 'admin') {
                return true;
            }

            // 检查是否超过每日限制
            if (user.dailyUsage >= this.DAILY_LIMIT) {
                return false;
            }

            user.dailyUsage++;
            this.writeUsers(users);
            return true;
        } catch (error) {
            logger.error('增加使用次数失败:', {
                error,
                userId
            });
            throw error;
        }
    }

    public static async getRemainingUsage(userId: string): Promise<number> {
        try {
            const user = await this.getUserById(userId);
            if (!user) return 0;

            // 管理员无使用限制
            if (user.role === 'admin') {
                return Infinity;
            }

            const today = new Date().toISOString().split('T')[0];
            const lastUsageDate = new Date(user.lastUsageDate).toISOString().split('T')[0];

            // 如果是新的一天，返回完整限制
            if (today !== lastUsageDate) {
                return this.DAILY_LIMIT;
            }

            return this.DAILY_LIMIT - user.dailyUsage;
        } catch (error) {
            logger.error('获取剩余使用次数失败:', {
                error,
                userId
            });
            throw error;
        }
    }
} 