import fs from 'fs';
import path from 'path';
import logger from './logger';
import dotenv from 'dotenv';
import { config } from '../config/config';
import validator from 'validator';
import { sanitize } from 'dompurify';
import { JSDOM } from 'jsdom';

const window = new JSDOM('').window;
const DOMPurify = require('dompurify')(window);

// 加载环境变量
dotenv.config();

export interface ValidationError {
    field: string;
    message: string;
}

export class InputValidationError extends Error {
    errors: ValidationError[];
    
    constructor(errors: ValidationError[]) {
        super('输入验证失败');
        this.errors = errors;
        this.name = 'InputValidationError';
    }
}

export interface User {
    id: string;
    username: string;
    email: string;
    password: string;
    role: 'user' | 'admin';
    dailyUsage: number;
    lastUsageDate: string;
    createdAt: string;
    totpSecret?: string;
    totpEnabled?: boolean;
    backupCodes?: string[];
    passkeyEnabled?: boolean;
    passkeyCredentials?: {
        id: string;
        name: string;
        credentialID: string;
        credentialPublicKey: string;
        counter: number;
        createdAt: string;
    }[];
    pendingChallenge?: string;
    currentChallenge?: string;
}

export class UserStorage {
    private static readonly USERS_FILE = path.join(process.cwd(), 'data', 'users.json');
    private static readonly DAILY_LIMIT = 5;

    // 输入净化
    private static sanitizeInput(input: string | undefined): string {
        if (!input) return '';
        return DOMPurify.sanitize(validator.trim(input));
    }

    // 密码强度检查
    private static validatePassword(password: string, username: string, isRegistration: boolean = true): ValidationError[] {
        const errors: ValidationError[] = [];

        // 登录时不检查密码强度
        if (!isRegistration) {
            return errors;
        }

        let score = 0;

        // 基本长度要求
        if (password.length < 8) {
            errors.push({ field: 'password', message: '密码长度至少需要8个字符' });
            return errors;
        } else if (password.length >= 12) {
            score += 2;
        } else {
            score += 1;
        }

        // 包含数字
        if (/\d/.test(password)) score += 1;
        // 包含小写字母
        if (/[a-z]/.test(password)) score += 1;
        // 包含大写字母
        if (/[A-Z]/.test(password)) score += 1;
        // 包含特殊字符
        if (/[!@#$%^&*(),.?":{}|<>]/.test(password)) score += 1;

        // 检查常见密码模式
        const commonPatterns = [
            /^123/, /password/i, /qwerty/i, /abc/i,
            new RegExp(username, 'i')
        ];

        if (commonPatterns.some(pattern => pattern.test(password))) {
            score = 0;
        }

        if (score < 2) {
            errors.push({ 
                field: 'password', 
                message: '密码强度不足，请确保密码包含以下条件之一：1. 长度超过12个字符；2. 包含数字和字母；3. 包含大小写字母；4. 包含特殊字符和字母' 
            });
        }

        return errors;
    }

    // 用户名验证
    private static validateUsername(username: string): ValidationError[] {
        const errors: ValidationError[] = [];

        if (!validator.isLength(username, { min: 3, max: 20 })) {
            errors.push({ field: 'username', message: '用户名长度必须在3-20个字符之间' });
        }

        if (!/^[a-zA-Z0-9_]+$/.test(username)) {
            errors.push({ field: 'username', message: '用户名只能包含字母、数字和下划线' });
        }

        if (/['";]/.test(username)) {
            errors.push({ field: 'username', message: '用户名包含非法字符' });
        }

        return errors;
    }

    // 邮箱验证
    private static validateEmail(email: string): ValidationError[] {
        const errors: ValidationError[] = [];

        if (!validator.isEmail(email)) {
            errors.push({ field: 'email', message: '请输入有效的邮箱地址' });
        }

        return errors;
    }

    // 验证用户输入
    public static validateUserInput(username: string, password: string, email?: string, isRegistration: boolean = false): ValidationError[] {
        const errors: ValidationError[] = [];
        
        // 净化输入
        const sanitizedUsername = this.sanitizeInput(username);
        const sanitizedEmail = email ? this.sanitizeInput(email) : '';

        // 检查必填字段
        if (!sanitizedUsername) {
            errors.push({ field: 'username', message: '用户名不能为空' });
        }
        if (!password) {
            errors.push({ field: 'password', message: '密码不能为空' });
        }

        // 验证用户名
        if (sanitizedUsername) {
            errors.push(...this.validateUsername(sanitizedUsername));
        }

        // 验证密码
        errors.push(...this.validatePassword(password, sanitizedUsername, isRegistration));

        // 注册时验证邮箱
        if (isRegistration && sanitizedEmail) {
            errors.push(...this.validateEmail(sanitizedEmail));
        }

        return errors;
    }

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
            // 验证输入
            const errors = this.validateUserInput(username, password, email, true);
            if (errors.length > 0) {
                throw new InputValidationError(errors);
            }

            const sanitizedUsername = this.sanitizeInput(username);
            const sanitizedEmail = this.sanitizeInput(email);

            const users = this.readUsers();
            
            // 检查用户名和邮箱是否已存在
            if (users.some(u => u.username === sanitizedUsername || u.email === sanitizedEmail)) {
                throw new InputValidationError([{ field: 'username', message: '用户名或邮箱已存在' }]);
            }

            const newUser: User = {
                id: (users.length + 1).toString(),
                username: sanitizedUsername,
                email: sanitizedEmail,
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
            // 验证输入（登录时不检查密码强度）
            const errors = this.validateUserInput(identifier, password, undefined, false);
            if (errors.length > 0) {
                throw new InputValidationError(errors);
            }

            const sanitizedIdentifier = this.sanitizeInput(identifier);
            const users = this.readUsers();
            
            return users.find(u => 
                (u.username === sanitizedIdentifier || u.email === sanitizedIdentifier) && 
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

    public static async getUserByUsername(username: string): Promise<User | null> {
        try {
            const users = this.readUsers();
            return users.find(u => u.username === username) || null;
        } catch (error) {
            logger.error('通过用户名获取用户失败:', {
                error,
                username
            });
            throw error;
        }
    }

    public static async updateUser(userId: string, updates: Partial<User>): Promise<User | null> {
        const users = this.readUsers();
        const idx = users.findIndex(u => u.id === userId);
        if (idx === -1) return null;
        // 合并所有字段，支持追加 passkeyCredentials
        users[idx] = { ...users[idx], ...updates };
        this.writeUsers(users);
        return users[idx];
    }
} 