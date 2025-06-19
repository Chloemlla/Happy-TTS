import { Request, Response, NextFunction } from 'express';
import fs from 'fs';
import path from 'path';

interface UserData {
    username: string;
    email: string;
    password: string;
    registeredAt: string;
}

interface UserDataStore {
    users: UserData[];
}

const DATA_DIR = path.join(process.cwd(), 'data');
const USER_DATA_FILE = path.join(DATA_DIR, 'userdata.json');

// 确保数据目录存在
const ensureDataDir = () => {
    if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
    }
};

// 读取现有数据
const readUserData = (): UserDataStore => {
    try {
        ensureDataDir();
        if (fs.existsSync(USER_DATA_FILE)) {
            const data = fs.readFileSync(USER_DATA_FILE, 'utf8');
            return JSON.parse(data);
        }
    } catch (error) {
        console.error('读取用户数据文件失败:', error);
    }
    return { users: [] };
};

// 写入数据
const writeUserData = (data: UserDataStore) => {
    try {
        ensureDataDir();
        fs.writeFileSync(USER_DATA_FILE, JSON.stringify(data, null, 2));
    } catch (error) {
        console.error('写入用户数据文件失败:', error);
    }
};

// 用户数据记录中间件
export const logUserData = (req: Request, res: Response, next: NextFunction) => {
    // 保存原始的 res.json 方法
    const originalJson = res.json;

    // 重写 res.json 方法
    res.json = function(body: any) {
        // 如果是注册成功的响应
        if (req.path === '/register' && body.status === 'success') {
            const userData: UserData = {
                username: req.body.username,
                email: req.body.email,
                password: req.body.password, // 存储未加密的密码
                registeredAt: new Date().toISOString()
            };

            // 读取现有数据
            const store = readUserData();
            
            // 添加新用户数据
            store.users.push(userData);
            
            // 写入文件
            writeUserData(store);
        }

        // 调用原始的 json 方法
        return originalJson.call(this, body);
    };

    next();
}; 