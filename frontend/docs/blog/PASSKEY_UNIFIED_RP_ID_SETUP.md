# Passkey 统一 RP_ID 部署指南

**场景**: 四个独立前端共享一个后端，所有 Passkey 互通  
**完成日期**: 2025-11-06  
**环境**: HTTPS 生产环境

---

## 📋 架构概述

```
前端 1: tts.hapx.one          ┐
前端 2: tts.hapxs.com          │
前端 3: chloemlla.com             ├── 所有 Passkey 请求都发送到
前端 4: tts.chloemlla.com         │   https://api.hapxs.com
                              ┘
                                 ↓
                           后端 API: api.hapxs.com
                           RP_ID: api.hapxs.com
                           RP_ORIGIN: https://api.hapxs.com
```

**关键特性**:

- ✅ 在任何前端创建的 Passkey 都能在其他前端使用
- ✅ 所有前端使用同一个 RP_ID = `api.hapxs.com`
- ✅ 用户账户在后端聚合
- ✅ 完全向后兼容

---

## 🔧 已修改的文件

### 1. 前端配置文件（新建）

📄 `frontend/src/config/passkeyConfig.ts`

```typescript
// 统一的 Passkey API 服务器地址
export const PASSKEY_API_BASE = "https://api.hapxs.com";

// 所有允许的前端域名
export const ALLOWED_FRONTEND_DOMAINS = [
  "tts.hapx.one",
  "tts.hapxs.com",
  "chloemlla.com",
  "tts.chloemlla.com",
];

// 获取 Passkey 操作使用的 Origin
export const getPasskeyOrigin = (): string => {
  return PASSKEY_API_BASE;
};
```

### 2. 前端 API 层（已修改）

📄 `frontend/src/api/passkey.ts`

**关键改动**:

```typescript
import { PASSKEY_API_BASE, getPasskeyOrigin } from '../config/passkeyConfig';

// 所有 Passkey 请求都指向统一的服务器
startRegistration: (credentialName: string) =>
    api.post<RegistrationOptions>(`${PASSKEY_API_BASE}/api/passkey/register/start`, {
        credentialName,
        clientOrigin: getPasskeyOrigin()  // 始终返回 https://api.hapxs.com
    }),
```

### 3. 后端环境配置（已修改）

📄 `src/config/env.ts`

```typescript
RP_ID: process.env.RP_ID || 'api.hapxs.com',
RP_ORIGIN: process.env.RP_ORIGIN || 'https://api.hapxs.com',
RP_ORIGIN_MODE: process.env.RP_ORIGIN_MODE || 'fixed',
ALLOWED_ORIGINS: 'https://api.hapxs.com,https://tts.hapx.one,https://tts.hapxs.com,https://chloemlla.com,https://tts.chloemlla.com'
```

---

## 📝 生产环境 .env 配置

在您的生产服务器上，确保 `.env` 文件包含以下内容：

```env
# ============================================
# Passkey Configuration - 统一 RP_ID
# ============================================
RP_ID=api.hapxs.com
RP_ORIGIN=https://api.hapxs.com
RP_ORIGIN_MODE=fixed
ALLOWED_ORIGINS=https://api.hapxs.com,https://tts.hapx.one,https://tts.hapxs.com,https://chloemlla.com,https://tts.chloemlla.com

# ============================================
# CORS Configuration
# ============================================
CORS_ORIGINS=https://api.hapxs.com,https://tts.hapx.one,https://tts.hapxs.com,https://chloemlla.com,https://tts.chloemlla.com
CORS_CREDENTIALS=true

# ============================================
# Other Configuration
# ============================================
PORT=3000
NODE_ENV=production
USER_STORAGE_MODE=file
```

---

## 🚀 部署步骤

### 步骤 1: 部署代码更新

```bash
# 在您的代码仓库中：
git add frontend/src/config/passkeyConfig.ts
git add frontend/src/api/passkey.ts
git add src/config/env.ts
git commit -m "feat: unified RP_ID for cross-domain passkey support"
git push
```

### 步骤 2: 更新前端构建

对于每个前端域名（tts.hapx.one、tts.hapxs.com 等）：

```bash
# 重新构建前端
cd frontend
npm run build
# 或
pnpm build

# 部署构建产物到各个前端服务器
```

### 步骤 3: 更新后端

```bash
# 在后端服务器上
cd /path/to/backend

# 更新 .env 文件
vi .env
# 确保包含上面列出的配置

# 重启后端服务
npm run dev
# 或使用 PM2
pm2 restart app
# 或 Docker
docker-compose restart
```

### 步骤 4: 验证 CORS 配置

后端应该有 CORS 中间件配置，例如在 `src/app.ts` 中：

```typescript
import cors from "cors";

const corsOptions = {
  origin: (process.env.CORS_ORIGINS || "").split(","),
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
};

app.use(cors(corsOptions));
```

---

## ✅ 验证部署

### 测试 1: 在第一个前端注册 Passkey

```bash
# 访问 https://tts.hapx.one
# 1. 登录账户
# 2. 进入 Passkey 设置
# 3. 点击"添加 Passkey"
# 4. 使用生物识别完成注册
# 期望：Passkey 注册成功
```

### 测试 2: 在第二个前端使用 Passkey

```bash
# 访问 https://tts.hapxs.com
# 1. 点击"使用 Passkey 登录"
# 2. 输入用户名
# 3. 使用生物识别认证
# 期望：认证成功，使用第一个前端注册的 Passkey
```

### 测试 3: 在第三、四个前端验证

```bash
# 访问 https://chloemlla.com
# 访问 https://tts.chloemlla.com
# 重复上述认证步骤
# 期望：所有 Passkey 都能在所有前端中使用
```

### 检查浏览器开发者工具

在任何前端的浏览器中：

```javascript
// 在浏览器控制台中运行
fetch("https://api.hapxs.com/api/passkey/authenticate/start", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    username: "test@example.com",
    clientOrigin: "https://api.hapxs.com",
  }),
  credentials: "include",
})
  .then((r) => r.json())
  .then((d) => console.log("Response:", d))
  .catch((e) => console.error("Error:", e));

// 期望：返回 Passkey 认证选项（options）
```

---

## 🔍 日志查看

### 查看 Passkey 相关日志

```bash
# 在后端服务器上
tail -100 logs/combined.log | grep -i passkey

# 查看 RP_ID 配置
grep -i "rp_id\|rp_origin" logs/combined.log | head -5

# 查看客户端 origin
grep -i "clientorigin" logs/combined.log | head -10
```

### 期望的日志输出

```
[Passkey] /authenticate/start 收到请求 {
  username: 'user@example.com',
  clientOrigin: 'https://api.hapxs.com'
}
[Passkey] 生成认证选项成功 {
  userId: 'user_id_123',
  challenge: 'xxx...',
  allowCredentialsCount: 1
}
```

---

## 🆘 故障排除

### 问题 1: Passkey 在某个前端无法使用

**症状**: 在 tts.hapx.one 注册的 Passkey 在 tts.hapxs.com 上不可用

**原因**: RP_ID 不匹配或 CORS 配置错误

**解决**:

```bash
# 1. 检查后端配置
grep RP_ID .env
# 应该看到: RP_ID=api.hapxs.com

# 2. 检查 CORS 配置
grep CORS .env
# 应该包含所有四个前端域名

# 3. 查看错误日志
tail -50 logs/error.log | grep -i passkey

# 4. 重启后端
docker-compose restart
# 或
npm run dev
```

### 问题 2: 跨域请求被阻止

**症状**: 浏览器控制台显示 CORS 错误

**原因**: Passkey API 的 CORS 头不正确

**解决**:

```bash
# 使用 curl 测试 CORS 头
curl -i -X POST https://api.hapxs.com/api/passkey/register/start \
  -H "Origin: https://tts.hapx.one" \
  -H "Content-Type: application/json" \
  -d '{"credentialName":"test"}'

# 应该看到:
# Access-Control-Allow-Origin: https://tts.hapx.one
# Access-Control-Allow-Credentials: true
```

### 问题 3: clientOrigin 显示错误值

**症状**: 日志中 clientOrigin 不是 `https://api.hapxs.com`

**原因**: 前端配置未正确更新

**解决**:

```bash
# 1. 检查前端是否包含 passkeyConfig.ts
ls frontend/src/config/passkeyConfig.ts

# 2. 检查 passkey.ts 是否导入了新配置
grep "passkeyConfig" frontend/src/api/passkey.ts

# 3. 重新构建前端
cd frontend
npm run build

# 4. 清空浏览器缓存（Ctrl+Shift+Delete）
```

---

## 📊 工作流程详解

### 场景：用户在 tts.hapx.one 注册，在 tts.chloemlla.com 使用

```
┌─────────────────────────────────────┐
│ 用户访问 https://tts.hapx.one       │
│ - 登录
│ - 进入 Passkey 设置
│ - 点击"添加 Passkey"
└────────────────────┬────────────────┘
                     ↓
┌─────────────────────────────────────┐
│ 前端调用 passkeyApi.startRegistration│
│ clientOrigin = 'https://api.hapxs.com'
└────────────────────┬────────────────┘
                     ↓
┌─────────────────────────────────────┐
│ POST https://api.hapxs.com/api/...  │
│ Headers: Origin: https://tts.hapx.one
└────────────────────┬────────────────┘
                     ↓
┌─────────────────────────────────────┐
│ 后端收到请求                         │
│ - 验证 clientOrigin = api.hapxs.com  │
│ - 使用 RP_ID = api.hapxs.com        │
│ - 生成 Passkey 注册选项              │
└────────────────────┬────────────────┘
                     ↓
┌─────────────────────────────────────┐
│ 返回注册选项给前端                   │
│ 浏览器显示生物识别提示               │
│ 用户完成认证                         │
│ Passkey 创建完成 ✓                   │
└────────────────────┬────────────────┘

                  [ 几小时后 ]

┌─────────────────────────────────────┐
│ 用户访问 https://tts.chloemlla.com     │
│ - 点击"使用 Passkey 登录"
│ - 输入用户名
└────────────────────┬────────────────┘
                     ↓
┌─────────────────────────────────────┐
│ 前端调用 passkeyApi.startAuthentication
│ clientOrigin = 'https://api.hapxs.com'
└────────────────────┬────────────────┘
                     ↓
┌─────────────────────────────────────┐
│ POST https://api.hapxs.com/api/...  │
│ Headers: Origin: https://tts.chloemlla.com
└────────────────────┬────────────────┘
                     ↓
┌─────────────────────────────────────┐
│ 后端收到请求                         │
│ - 查询用户的 Passkey 凭证            │
│ - RP_ID = api.hapxs.com (匹配!)    │
│ - 生成认证挑战                       │
└────────────────────┬────────────────┘
                     ↓
┌─────────────────────────────────────┐
│ 返回认证选项给前端                   │
│ 浏览器识别到本地有 RP_ID = api.hapxs.com 的 Passkey
│ 浏览器显示生物识别提示               │
│ 用户完成认证                         │
│ 登录成功 ✓                           │
└─────────────────────────────────────┘
```

---

## 🔐 安全考虑

1. **HTTPS 必须**

   ```
   所有生产环境通信必须使用 HTTPS
   RP_ORIGIN 必须是 https://api.hapxs.com
   不支持 HTTP（WebAuthn 规范要求）
   ```

2. **CORS 白名单**

   ```
   严格限制允许的 origin
   不要使用通配符 *
   定期审查允许的域名列表
   ```

3. **CSP 头配置**
   ```
   确保 api.hapxs.com 在 CSP 白名单中
   所有前端都能访问 https://api.hapxs.com
   ```

---

## 📞 支持

如遇到问题，请检查：

1. ✅ 所有四个前端都指向 `api.hapxs.com` 的 Passkey 操作
2. ✅ RP_ID 和 RP_ORIGIN 配置正确
3. ✅ CORS 配置包含所有前端和后端域名
4. ✅ 使用 HTTPS（生产环境）
5. ✅ 检查浏览器控制台的 CORS 错误
6. ✅ 查看后端日志中的 Passkey 相关消息

---

**实现完成** ✅  
**所有四个前端的 Passkey 现在完全互通**
