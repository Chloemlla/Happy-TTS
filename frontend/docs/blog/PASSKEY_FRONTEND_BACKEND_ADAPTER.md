---
title: Passkey 前后端适配指南
date: 2025-11-06
slug: passkey-frontend-backend-adapter
tags: [passkey, frontend, backend, integration]
---

# Passkey 前后端适配指南

## 📋 概述

本文档说明了前端和后端的 Passkey 服务如何相互协作，确保 Passkey 的注册和认证流程正常运行。

---

## 🔄 数据流向

### 1. 注册流程

#### 步骤 1: 前端请求注册选项

**前端代码**:

```typescript
// frontend/src/api/passkey.ts
startRegistration: (credentialName: string) =>
  api.post<RegistrationOptions>(
    `${PASSKEY_API_BASE}/api/passkey/register/start`,
    {
      credentialName,
      clientOrigin: getClientOrigin(),
    }
  );
```

**请求格式**:

```json
{
  "credentialName": "My Passkey",
  "clientOrigin": "https://api.hapxs.com"
}
```

**后端处理** (`src/routes/passkeyRoutes.ts:27-90`):

```typescript
router.post(
  "/register/start",
  authenticateToken,
  rateLimitMiddleware,
  async (req, res) => {
    const userId = (req as any).user?.id;
    const { credentialName, clientOrigin } = req.body;

    // 调用 PasskeyService 生成选项
    const options = await PasskeyService.generateRegistrationOptions(
      user,
      credentialName,
      clientOrigin
    );

    // 保存 challenge
    await UserStorage.updateUser(userId, {
      pendingChallenge: options.challenge,
    });

    // 返回格式
    res.json({ options });
  }
);
```

**响应格式**:

```json
{
  "rp": {
    "name": "Synapse",
    "id": "api.hapxs.com"
  },
  "user": {
    "id": "...",
    "name": "...",
    "displayName": "..."
  },
  "challenge": "...",
  "pubKeyCredParams": [...],
  "timeout": 60000,
  "attestation": "none",
  "authenticatorSelection": {...},
  "excludeCredentials": [...]
}
```

#### 步骤 2: 前端提取选项并调用浏览器 API

**前端代码** (`frontend/src/hooks/usePasskey.ts:52-77`):

```typescript
const optionsResponse = await passkeyApi.startRegistration(credentialName);

// Axios 自动包装: { data: { options: {...} } }
const rawOptions = optionsResponse?.data?.options;

if (!rawOptions) {
  throw new Error("无法获取注册选项");
}

// 调用浏览器 Passkey API
attResp = await startRegistration({ optionsJSON: rawOptions });
```

**关键点**:

- ✅ Axios 响应包装: 后端 `res.json({ options })` → 前端 `response.data.options`
- ✅ 验证选项存在，否则提前返回
- ✅ 使用 `{ optionsJSON: rawOptions }` 调用浏览器 API

#### 步骤 3: 完成注册

**前端代码** (`frontend/src/hooks/usePasskey.ts:88`):

```typescript
const finishResp = await passkeyApi.finishRegistration(credentialName, attResp);
```

**请求格式**:

```json
{
  "credentialName": "My Passkey",
  "response": {
    "id": "...",
    "rawId": "...",
    "response": {...},
    "type": "public-key"
  },
  "clientOrigin": "https://api.hapxs.com"
}
```

**后端处理** (`src/routes/passkeyRoutes.ts:98-131`):

```typescript
router.post(
  "/register/finish",
  authenticateToken,
  rateLimitMiddleware,
  async (req, res) => {
    const { credentialName, response, clientOrigin } = req.body;

    // 验证注册响应
    const verification = await PasskeyService.verifyRegistration(
      user,
      response,
      credentialName,
      clientOrigin
    );

    // 返回更新后的凭证列表
    res.json({
      ...verification,
      passkeyCredentials: updatedUser?.passkeyCredentials || [],
    });
  }
);
```

---

### 2. 认证流程

#### 步骤 1: 前端请求认证选项

**前端代码** (`frontend/src/api/passkey.ts:60-64`):

```typescript
startAuthentication: (username: string) =>
  api.post<AuthenticationOptions>(
    `${PASSKEY_API_BASE}/api/passkey/authenticate/start`,
    {
      username,
      clientOrigin: getClientOrigin(),
    }
  );
```

**后端处理** (`src/routes/passkeyRoutes.ts:134-195`):

```typescript
router.post("/authenticate/start", rateLimitMiddleware, async (req, res) => {
  const { username, clientOrigin } = req.body;

  // 获取用户的 Passkey 凭证
  const user = await UserStorage.getUserByUsername(username);

  // 生成认证选项
  const options = await PasskeyService.generateAuthenticationOptions(
    user,
    clientOrigin
  );

  // 保存 challenge
  await UserStorage.updateUser(user.id, {
    pendingChallenge: options.challenge,
  });

  // 返回格式
  res.json({ options });
});
```

**响应格式**:

```json
{
  "challenge": "...",
  "timeout": 60000,
  "rpId": "api.hapxs.com",
  "allowCredentials": [...],
  "userVerification": "required"
}
```

#### 步骤 2: 前端提取选项并调用浏览器 API

**前端代码** (`frontend/src/hooks/usePasskey.ts:210-234`):

```typescript
const options = optionsResponse?.data?.options;

if (!options) {
  throw new Error("无法获取认证选项");
}

asseResp = await startAuthentication({ optionsJSON: options });
```

#### 步骤 3: 完成认证

**前端代码** (`frontend/src/hooks/usePasskey.ts:313`):

```typescript
const resp = await passkeyApi.finishAuthentication(username, asseResp);
await loginWithToken(resp.data.token, resp.data.user);
```

**后端处理** (`src/routes/passkeyRoutes.ts:198-349`):

```typescript
router.post("/authenticate/finish", rateLimitMiddleware, async (req, res) => {
  const { username, response, clientOrigin } = req.body;

  // 验证认证响应
  const verification = await PasskeyService.verifyAuthentication(
    user,
    response,
    clientOrigin
  );

  if (!verification.verified) {
    return res.status(401).json({ error: "Passkey验证失败" });
  }

  // 生成 JWT token
  const token = await PasskeyService.generateToken(user);

  // 返回 token 和用户信息
  res.json({
    success: true,
    token: token,
    user: {
      id: user.id,
      username: user.username,
      email: user.email,
    },
  });
});
```

---

## 📊 数据结构映射

### Axios 响应包装

```
后端返回:          res.json({ options })
                       ↓
Axios 拦截:        { data: { options: {...} } }
                       ↓
前端获取:          response.data.options
```

### 完整的请求/响应链

| 阶段           | 前端                                   | 后端                     | 浏览器       |
| -------------- | -------------------------------------- | ------------------------ | ------------ |
| 请求注册选项   | `passkeyApi.startRegistration()`       | 生成选项、保存 challenge | -            |
| 提取选项       | `response?.data?.options`              | -                        | -            |
| 调用浏览器 API | `startRegistration({ optionsJSON })`   | -                        | 生成 Passkey |
| 完成注册       | `passkeyApi.finishRegistration()`      | 验证、保存凭证           | -            |
| 请求认证选项   | `passkeyApi.startAuthentication()`     | 生成选项、保存 challenge | -            |
| 调用浏览器 API | `startAuthentication({ optionsJSON })` | -                        | 使用 Passkey |
| 完成认证       | `passkeyApi.finishAuthentication()`    | 验证、生成 token         | -            |

---

## ✅ 前端验证清单

前端代码应确保以下几点：

- [x] **正确提取选项**: `response?.data?.options` (不要用其他路径)
- [x] **验证选项存在**: 在调用浏览器 API 前检查
- [x] **正确调用 API**: 使用 `{ optionsJSON: options }` 格式
- [x] **传递 clientOrigin**: 所有请求都包含 `clientOrigin` 参数
- [x] **处理响应**: 提取 `response.data` 中的数据

---

## ✅ 后端验证清单

后端代码应确保以下几点：

- [x] **接收 clientOrigin**: 从请求体中提取
- [x] **传递给服务层**: 调用 `PasskeyService` 时传递
- [x] **保存 challenge**: 更新用户的 `pendingChallenge`
- [x] **返回正确格式**: `res.json({ options })` 或 `res.json({ success, token, user })`
- [x] **验证响应**: 检查验证结果后返回

---

## 🔍 调试技巧

### 前端调试

1. **打开浏览器开发者工具** → Network 标签
2. **观察请求**:
   ```
   POST /api/passkey/register/start
   请求体: { credentialName: "...", clientOrigin: "..." }
   ```
3. **观察响应**:
   ```
   响应: { options: { challenge: "...", ... } }
   ```
4. **检查 Console** 的 debug 日志

### 后端调试

1. **检查日志**:
   ```bash
   grep -i "passkey" logs/combined.log
   ```
2. **查看 clientOrigin**:
   ```
   [Passkey] /register/start 收到请求 { clientOrigin: "..." }
   ```
3. **验证保存的 challenge**:
   ```
   [Passkey] /register/start options { challenge: "..." }
   ```

---

## 🚀 测试流程

### 1. 本地测试

```bash
# 确保后端运行在 https://api.hapxs.com
npm run dev

# 在前端访问 Passkey 设置
# 观察 Network 标签中的请求/响应
```

### 2. 跨域测试

```bash
# 从不同域名访问（如 https://tts.hapx.one）
# 确保 clientOrigin 被正确发送和处理
```

### 3. 错误处理测试

```bash
# 测试无效的 clientOrigin
# 测试过期的 challenge
# 测试无效的凭证
```

---

## ⚠️ 常见问题

### Q: Passkey 注册失败，提示"options 为空"

**A**: 检查以下几点：

1. ✅ 后端是否正确返回了 `res.json({ options })`
2. ✅ 前端是否正确提取了 `response?.data?.options`
3. ✅ Network 标签中后端响应是否包含 `options` 字段

### Q: Passkey 认证失败，提示"找不到匹配的认证器"

**A**: 检查以下几点：

1. ✅ RP_ID 是否与注册时相同（应为 `api.hapxs.com`）
2. ✅ 用户的 `passkeyCredentials` 是否正确保存
3. ✅ `clientOrigin` 是否正确传递

### Q: 跨域 Passkey 无法使用

**A**: 确保：

1. ✅ 所有请求都发往同一个后端 (`https://api.hapxs.com`)
2. ✅ `clientOrigin` 正确反映前端的实际来源
3. ✅ CORS 配置正确

---

## 📞 支持

如遇到问题，请检查：

1. 后端日志：`grep -i passkey logs/combined.log`
2. 浏览器 Network 标签中的请求/响应
3. 浏览器 Console 中的错误信息
4. 本文档中的调试技巧

---

**实现完成** ✅
