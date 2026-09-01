import fs from "node:fs";
import path from "node:path";
import type { NextFunction, Request, Response } from "express";
import { mongoose } from "../services/mongoService";
import logger from "../utils/logger";

// MongoDB 用户注册审计 Schema。不要和 canonical user_datas 集合混用。
const UserDataSchema = new mongoose.Schema(
  {
    users: { type: Array, required: true, default: [] },
  },
  { collection: "user_registration_audits" },
);
const UserDataModel = mongoose.models.UserData || mongoose.model("UserData", UserDataSchema);

interface UserData {
  username: string;
  email: string;
  registeredAt: string;
  ip?: string;
  userAgent?: string;
}

interface UserDataStore {
  users: UserData[];
}

const DATA_DIR = path.join(process.cwd(), "data");
const USER_DATA_FILE = path.join(DATA_DIR, "user-registration-audits.json");

// 确保数据目录存在
const ensureDataDir = async () => {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      await fs.promises.mkdir(DATA_DIR, { recursive: true });
    }
  } catch (error) {
    logger.error("创建数据目录失败:", error);
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
    logger.error("MongoDB 读取用户数据失败，降级为本地文件:", error);
  }
  return readUserDataFromFile();
};

const readUserDataFromFile = async (): Promise<UserDataStore> => {
  try {
    await ensureDataDir();
    if (fs.existsSync(USER_DATA_FILE)) {
      const data = await fs.promises.readFile(USER_DATA_FILE, "utf8");
      return JSON.parse(data);
    }
  } catch (error) {
    logger.error("读取用户数据文件失败:", error);
  }
  return { users: [] };
};

// G1-21: 本地文件兜底原本是"读整份 → push → 写整份"，两个并发注册会互相覆盖。
// 串成单链保证进程内互斥，并用临时文件 + rename 落盘，避免写入中途崩溃留下截断的 JSON。
let fileAppendChain: Promise<void> = Promise.resolve();

const appendUserDataToFile = (userData: UserData): Promise<void> => {
  fileAppendChain = fileAppendChain.then(async () => {
    try {
      await ensureDataDir();
      const store = await readUserDataFromFile();
      store.users.push(userData);
      const tempFile = `${USER_DATA_FILE}.${process.pid}.tmp`;
      await fs.promises.writeFile(tempFile, JSON.stringify(store, null, 2));
      await fs.promises.rename(tempFile, USER_DATA_FILE);
    } catch (error) {
      logger.error("写入用户数据文件失败:", error);
    }
  });
  return fileAppendChain;
};

// 追加一条用户数据（Mongo 用原子 $push，避免并发覆盖）
const writeUserData = async (userData: UserData) => {
  try {
    if (mongoose.connection.readyState === 1) {
      await UserDataModel.updateOne({}, { $push: { users: userData } }, { upsert: true });
      return;
    }
  } catch (error) {
    logger.error("MongoDB 写入用户数据失败，降级为本地文件:", error);
  }
  await appendUserDataToFile(userData);
};

// 用户数据记录中间件
export const logUserData = (req: Request, res: Response, next: NextFunction) => {
  // 保存原始的 res.json 方法
  const originalJson = res.json;

  // 重写 res.json 方法
  res.json = function (body: any) {
    // 如果是注册成功的响应
    if (req.path === "/register" && (body?.status === "success" || body?.success === true || body?.needVerify === true)) {
      // 异步处理文件操作，不阻塞响应
      (async () => {
        try {
          const userData: UserData = {
            username: req.body.username,
            email: req.body.email,
            registeredAt: new Date().toISOString(),
            ip: req.ip,
            userAgent: req.get("user-agent"),
          };

          await writeUserData(userData);
        } catch (error) {
          logger.error("记录用户数据失败:", error);
        }
      })();
    }

    // 调用原始的 json 方法
    return originalJson.call(this, body);
  };

  next();
};
