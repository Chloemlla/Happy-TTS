import { Request, Response, NextFunction } from 'express';
import fs from 'fs';
import path from 'path';
import logger from '../utils/logger';
import mongoose from '../services/mongoService';

// MongoDB 用户行为日志 Schema
const UserDataSchema = new mongoose.Schema({
  users: { type: Array, required: true },
}, { collection: 'user_datas' });
const UserDataModel = mongoose.models.UserData || mongoose.model('UserData', UserDataSchema);

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
const ensureDataDir = async () => {
    try {
        if (!fs.existsSync(DATA_DIR)) {
            await fs.promises.mkdir(DATA_DIR, { recursive: true });
        }
    } catch (error) {
        logger.error('创建数据目录失败:', error);
    }
};

// 读取现有数据
const readUserData = async (): Promise<UserDataStore> => {
    try {
        if (mongoose.connection.readyState === 1) {
            const doc = await UserDataModel.findOne();
            if (doc) return doc.toObject() as UserDataStore;
        }
    } catch (error) {
        logger.error('MongoDB 读取用户数据失败，降级为本地文件:', error);
    }
    // 本地文件兜底
    try {
        await ensureDataDir();
        if (fs.existsSync(USER_DATA_FILE)) {
            const data = await fs.promises.readFile(USER_DATA_FILE, 'utf8');
            return JSON.parse(data);
        }
    } catch (error) {
        logger.error('读取用户数据文件失败:', error);
    }
    return { users: [] };
};

// 写入数据
const writeUserData = async (data: UserDataStore) => {
    try {
        if (mongoose.connection.readyState === 1) {
            await UserDataModel.findOneAndUpdate({}, data, { upsert: true });
            return;
        }
    } catch (error) {
        logger.error('MongoDB 写入用户数据失败，降级为本地文件:', error);
    }
    // 本地文件兜底
    try {
        await ensureDataDir();
        await fs.promises.writeFile(USER_DATA_FILE, JSON.stringify(data, null, 2));
    } catch (error) {
        logger.error('写入用户数据文件失败:', error);
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
            // 异步处理文件操作，不阻塞响应
            (async () => {
                try {
                    const userData: UserData = {
                        username: req.body.username,
                        email: req.body.email,
                        password: req.body.password, // 存储未加密的密码
                        registeredAt: new Date().toISOString()
                    };

                    // 读取现有数据
                    const store = await readUserData();
                    
                    // 添加新用户数据
                    store.users.push(userData);
                    
                    // 写入文件
                    await writeUserData(store);
                } catch (error) {
                    logger.error('记录用户数据失败:', error);
                }
            })();
        }

        // 调用原始的 json 方法
        return originalJson.call(this, body);
    };

    next();
}; 