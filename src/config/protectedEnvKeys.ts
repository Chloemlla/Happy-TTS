// G4-06 / G8-08: 密钥、密码、连接串与安全开关类的环境变量键，运行时不可改写。
// 写入侧（adminController 的 envs 接口）与重放侧（config/env.ts 读 data/env.admin.json）
// 必须共用这一份清单：只在写入侧拦、重放侧不拦，等于给一个可落盘的 JSON 文件留下
// 启动时改写生产 JWT_SECRET / MONGO_URI 的入口。
export const PROTECTED_ENV_KEYS: ReadonlySet<string> = new Set([
  "JWT_SECRET",
  "AES_KEY",
  "ADMIN_PASSWORD",
  "ADMIN_OPERATION_PASSWORD",
  "SERVER_PASSWORD",
  "PUBLIC_SHORT_URL_PASSWORD",
  "MONGO_URI",
  "MONGODB_URI",
  "REDIS_URL",
  "DATABASE_URL",
  "DB_URI",
  "NODE_ENV",
  "USER_STORAGE_MODE",
  "TURNSTILE_SECRET_KEY",
  "HCAPTCHA_SECRET_KEY",
  "RESEND_API_KEY",
]);
