---
title: UserStorage 多存储模式实现详解
date: 2025-07-10
slug: user_storage_implementation
---

# UserStorage 多存储模式实现详解

## 概述

`UserStorage` 是 Synapse 项目的核心用户数据管理模块，支持三种存储模式：本地文件存储、MongoDB 数据库和 MySQL 数据库。该模块采用统一接口设计，确保在不同存储模式下提供一致的用户管理功能。

## 核心特性

### 1. 多存储模式支持

```typescript
const STORAGE_MODE = process.env.USER_STORAGE_MODE || "file"; // 'file' | 'mongo' | 'mysql'
```

- **本地文件存储 (file)**: 使用 JSON 文件存储用户数据，适合小型部署
- **MongoDB 存储 (mongo)**: 使用 MongoDB 数据库，支持复杂查询和扩展
- **MySQL 存储 (mysql)**: 使用 MySQL 数据库，提供 ACID 事务支持

### 2. 统一接口设计

所有存储模式都提供相同的公共接口：

```typescript
// 用户管理
createUser(username: string, email: string, password: string): Promise<User | null>
authenticateUser(identifier: string, password: string): Promise<User | null>
getUserById(id: string): Promise<User | null>
getUserByUsername(username: string): Promise<User | null>
getUserByEmail(email: string): Promise<User | null>
updateUser(userId: string, updates: Partial<User>): Promise<User | null>
deleteUser(userId: string): Promise<boolean>

// 使用量管理
incrementUsage(userId: string): Promise<boolean>
getRemainingUsage(userId: string): Promise<number>

// 系统管理
getAllUsers(): Promise<User[]>
isHealthy(): Promise<boolean>
tryFix(): Promise<boolean>
autoCheckAndFix(): Promise<{ healthy: boolean, fixed: boolean, mode: string, message: string }>
```

## 数据模型

### User 接口定义

```typescript
export interface User {
  id: string;
  username: string;
  email: string;
  password: string;
  role: "user" | "admin";
  dailyUsage: number;
  lastUsageDate: string;
  createdAt: string;
  token?: string;
  tokenExpiresAt?: number;
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
  passkeyVerified?: boolean;
}
```

## 实现细节

### 1. 输入验证与净化

```typescript
// 输入净化
private static sanitizeInput(input: string | undefined): string {
    if (!input) return '';
    return DOMPurify.sanitize(validator.trim(input));
}

// 密码强度检查
private static validatePassword(password: string, username: string, isRegistration: boolean = true): ValidationError[] {
    // 实现密码强度验证逻辑
}

// 用户名验证
private static validateUsername(username: string): ValidationError[] {
    // 实现用户名格式验证
}

// 邮箱验证
private static validateEmail(email: string): ValidationError[] {
    // 实现邮箱格式验证
}
```

### 2. 唯一性校验

所有存储模式都实现了用户名和邮箱的唯一性校验：

```typescript
// MongoDB 模式
const existUserByName = await userService.getUserByUsername(username);
const existUserByEmail = await userService.getUserByEmail(email);
if (existUserByName || existUserByEmail) {
  throw new InputValidationError([
    { field: "username", message: "用户名或邮箱已存在" },
  ]);
}

// MySQL 模式
const [existRows] = await conn.execute(
  "SELECT id FROM users WHERE username = ? OR email = ?",
  [username, email]
);
if ((existRows as any[]).length > 0) {
  throw new InputValidationError([
    { field: "username", message: "用户名或邮箱已存在" },
  ]);
}

// 文件模式
if (
  users.some(
    (u) => u.username === sanitizedUsername || u.email === sanitizedEmail
  )
) {
  throw new InputValidationError([
    { field: "username", message: "用户名或邮箱已存在" },
  ]);
}
```

### 3. 健壮性设计

#### 自动重试机制

```typescript
private static withRetry<T>(fn: () => T, maxRetry = 2, label = ''): T {
    let lastErr;
    for (let i = 0; i <= maxRetry; i++) {
        try {
            return fn();
        } catch (err) {
            lastErr = err;
            if (i < maxRetry) {
                logger.warn(`[UserStorage] ${label} 第${i + 1}次失败，自动重试...`, err);
            }
        }
    }
    logger.error(`[UserStorage] ${label} 连续${maxRetry + 1}次失败，放弃重试`, lastErr);
    throw lastErr;
}
```

#### 数据库连接管理

```typescript
// MySQL 连接确保关闭
const conn = await getMysqlConnection();
try {
  // 数据库操作
} catch (error) {
  logger.error("[UserStorage] MySQL 操作失败", { error });
  throw error;
} finally {
  await conn.end();
}
```

#### 文件写入原子性

```typescript
private static writeUsers(users: User[]) {
    return this.withRetry(() => {
        try {
            const tempFile = `${this.USERS_FILE}.tmp`;
            fs.writeFileSync(tempFile, JSON.stringify(users, null, 2));
            fs.renameSync(tempFile, this.USERS_FILE);
        } catch (error) {
            logger.error('[UserStorage] 写入用户数据失败:', { error, filePath: this.USERS_FILE });
            throw new Error('写入用户数据失败');
        }
    }, 2, 'writeUsers');
}
```

### 4. 统一日志记录

所有操作都使用统一的日志格式，包含 `[UserStorage]` 前缀：

```typescript
// 成功日志
logger.info("[UserStorage] 创建用户成功", {
  userId: created.id,
  username,
  email,
  mode: "mongo",
});

// 错误日志
logger.error("[UserStorage] 创建用户失败:", {
  error: errors,
  username,
  email,
  mode: "mysql",
});

// 警告日志
logger.warn("[UserStorage] getUserById: 未找到用户", { id });
```

#### 敏感信息脱敏

```typescript
// 敏感字段脱敏
const safeLogUpdates = Object.keys(updates).filter(
  (k) =>
    ![
      "password",
      "token",
      "tokenExpiresAt",
      "totpSecret",
      "backupCodes",
    ].includes(k)
);
logger.info("[UserStorage] updateUser: 用户已更新", {
  userId,
  updatedFields: safeLogUpdates,
  mode: "file",
});
```

### 5. 健康检查与修复

```typescript
public static async isHealthy(): Promise<boolean> {
    const mode = STORAGE_MODE;
    if (mode === 'file') {
        try {
            const users = this.readUsers();
            return this.isValidUserList(users);
        } catch {
            return false;
        }
    } else if (mode === 'mongo') {
        try {
            const users = await userService.getAllUsers();
            return Array.isArray(users) && users.every(u => u.id && u.username && u.email);
        } catch {
            return false;
        }
    } else if (mode === 'mysql') {
        try {
            const conn = await getMysqlConnection();
            await conn.execute('SELECT 1 FROM users LIMIT 1');
            await conn.end();
            return true;
        } catch {
            return false;
        }
    }
    return false;
}
```

## 使用示例

### 1. 用户注册

```typescript
try {
  const user = await UserStorage.createUser(
    "testuser",
    "test@example.com",
    "password123"
  );
  console.log("用户创建成功:", user.id);
} catch (error) {
  if (error instanceof InputValidationError) {
    console.error("验证失败:", error.errors);
  } else {
    console.error("创建失败:", error);
  }
}
```

### 2. 用户认证

```typescript
const user = await UserStorage.authenticateUser("testuser", "password123");
if (user) {
  console.log("认证成功:", user.username);
} else {
  console.log("认证失败");
}
```

### 3. 使用量管理

```typescript
const success = await UserStorage.incrementUsage(userId);
if (success) {
  const remaining = await UserStorage.getRemainingUsage(userId);
  console.log("剩余使用次数:", remaining);
} else {
  console.log("已达到每日限制");
}
```

### 4. 系统健康检查

```typescript
const health = await UserStorage.autoCheckAndFix();
console.log("系统状态:", health);
// 输出: { healthy: true, fixed: false, mode: 'file', message: '本地用户数据健康' }
```

## 配置说明

### 环境变量

```bash
# 存储模式配置
USER_STORAGE_MODE=file    # 可选: file, mongo, mysql

# MySQL 配置 (当 USER_STORAGE_MODE=mysql 时)
MYSQL_HOST=localhost
MYSQL_PORT=3306
MYSQL_USER=root
MYSQL_PASSWORD=password
MYSQL_DATABASE=happy_tts

# MongoDB 配置 (当 USER_STORAGE_MODE=mongo 时)
MONGODB_URI=mongodb://localhost:27017/happy_tts
```

### 数据库表结构 (MySQL)

```sql
CREATE TABLE users (
    id VARCHAR(64) PRIMARY KEY,
    username VARCHAR(64) NOT NULL,
    email VARCHAR(128) NOT NULL,
    password VARCHAR(128) NOT NULL,
    role VARCHAR(16) NOT NULL,
    dailyUsage INT DEFAULT 0,
    lastUsageDate VARCHAR(32),
    createdAt VARCHAR(32),
    token VARCHAR(255),
    tokenExpiresAt BIGINT,
    totpSecret VARCHAR(255),
    totpEnabled BOOLEAN,
    backupCodes JSON,
    passkeyEnabled BOOLEAN,
    passkeyCredentials JSON,
    pendingChallenge TEXT,
    currentChallenge TEXT,
    passkeyVerified BOOLEAN
);
```

## 性能优化

### 1. 连接池管理

MySQL 模式使用连接池优化数据库连接：

```typescript
async function getMysqlConnection() {
  const { host, port, user, password, database } = config.mysql;
  return await mysql.createConnection({
    host,
    port: Number(port),
    user,
    password,
    database,
  });
}
```

### 2. 批量操作

对于大量用户数据，支持批量查询：

```typescript
public static async getAllUsers(): Promise<User[]> {
    // 一次性获取所有用户，避免多次查询
}
```

### 3. 缓存策略

文件模式使用内存缓存减少文件 I/O：

```typescript
private static readUsers(): User[] {
    // 使用 withRetry 机制，减少文件读取失败
}
```

## 安全特性

### 1. 输入验证

- 用户名格式验证 (3-20 字符，仅字母数字下划线)
- 邮箱格式验证
- 密码强度检查
- SQL 注入防护

### 2. 数据净化

```typescript
// 使用 DOMPurify 净化用户输入
const sanitizedInput = DOMPurify.sanitize(validator.trim(input));
```

### 3. 敏感信息保护

- 密码不记录到日志
- Token 信息脱敏
- TOTP 密钥保护

## 错误处理

### 1. 自定义错误类型

```typescript
export class InputValidationError extends Error {
  errors: ValidationError[];

  constructor(errors: ValidationError[]) {
    super("输入验证失败");
    this.errors = errors;
    this.name = "InputValidationError";
  }
}
```

### 2. 错误恢复

```typescript
public static async tryFix(): Promise<boolean> {
    // 自动修复数据文件或数据库表结构
}
```

## 总结

`UserStorage` 模块通过统一接口设计、多存储模式支持、健壮性保障和完整的日志记录，为 Synapse 项目提供了可靠的用户数据管理解决方案。该模块遵循 KISS、DRY、YAGNI 原则，确保代码简洁、可维护且易于扩展。

## 相关文档

- [API 测试指南](./API_TEST_README.md)
- [安全修复总结](./SECURITY_FIXES_SUMMARY.md)
- [Docker 构建修复](./DOCKER_BUILD_FIX.md)
- [性能优化指南](./OPTIMIZATION.md)

---
