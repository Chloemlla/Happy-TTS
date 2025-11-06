---
title: Passkey CORS 问题修复指南
date: 2025-11-06
slug: cors-passkey-fix
tags: [passkey, cors, development, configuration]
---

# Passkey CORS 问题修复

## 问题描述

在开发环境中，前端在 `http://localhost:3001` 尝试访问 `https://api.hapxs.com` 的 Passkey API 时，收到 CORS 错误：

```
Access to XMLHttpRequest at 'https://api.hapxs.com/api/passkey/register/start'
from origin 'http://localhost:3001' has been blocked by CORS policy:
Response to preflight request doesn't pass access control check:
No 'Access-Control-Allow-Origin' header is present on the requested resource.
```

### 根本原因

前端硬编码了 `PASSKEY_API_BASE = 'https://api.hapxs.com'`，导致在开发环境中跨域请求被浏览器阻止。

---

## 解决方案

### 核心思路

**动态路由 + 生产一致性**：

```
开发环境：
  API 请求 → http://localhost:3000 (本地后端，避免 CORS)
  clientOrigin → https://api.hapxs.com (始终保持生产值)

生产环境：
  API 请求 → https://api.hapxs.com (生产后端)
  clientOrigin → https://api.hapxs.com (生产值)
```

这样做的好处：

- ✅ 开发环境避免 CORS 问题
- ✅ 生产环境确保 Passkey RP_ID 一致性
- ✅ clientOrigin 始终一致，确保 Passkey 验证正确

---

## 代码变更

### 1. `frontend/src/config/passkeyConfig.ts`

#### 新增函数：`getPasskeyApiBase()`

```typescript
/**
 * 获取 Passkey API 基础 URL
 *
 * 开发环境：使用本地后端地址（避免 CORS 问题）
 * 生产环境：使用统一的后端地址（确保 RP_ID 一致性）
 */
export const getPasskeyApiBase = (): string => {
  if (typeof window === "undefined") {
    return "https://api.hapxs.com";
  }

  if (import.meta.env.DEV) {
    // 开发环境：使用本地后端，避免 CORS 问题
    const currentHost = window.location.hostname;
    const currentPort = window.location.port;

    if (currentHost === "192.168.10.7" && currentPort === "3001") {
      return "http://192.168.10.7:3000";
    }

    return "http://localhost:3000";
  }

  // 生产环境：使用统一的后端
  return "https://api.hapxs.com";
};
```

#### 修改函数：`getPasskeyOrigin()`

```typescript
/**
 * 获取 Passkey 操作使用的 Origin（clientOrigin）
 *
 * 这是发送给后端的 origin 参数，用于 Passkey 验证
 * - 在所有环境中，都应该返回生产的 RP_ORIGIN（https://api.hapxs.com）
 * - 这确保了 Passkey 的一致性，不管从哪个环境访问
 */
export const getPasskeyOrigin = (): string => {
  // 无论在开发还是生产环境，clientOrigin 总是生产的 RP_ORIGIN
  return "https://api.hapxs.com";
};
```

### 2. `frontend/src/api/passkey.ts`

#### 导入变更

```typescript
// 之前
import { PASSKEY_API_BASE, getPasskeyOrigin } from "../config/passkeyConfig";

// 之后
import { getPasskeyApiBase, getPasskeyOrigin } from "../config/passkeyConfig";
```

#### API 调用变更

```typescript
// 之前
startRegistration: (credentialName: string) =>
    api.post<RegistrationOptions>(`${PASSKEY_API_BASE}/api/passkey/register/start`, {
        credentialName,
        clientOrigin: getClientOrigin()
    }),

// 之后
startRegistration: (credentialName: string) =>
    api.post<RegistrationOptions>(`${getPasskeyApiBase()}/api/passkey/register/start`, {
        credentialName,
        clientOrigin: getClientOrigin()
    }),
```

所有其他 Passkey API 调用都遵循相同的模式：

- `finishRegistration`
- `startAuthentication`
- `finishAuthentication`

---

## 工作流程示意

### 开发环境 (`http://localhost:3001`)

```
前端应用 (localhost:3001)
    ↓
Passkey API 请求 → http://localhost:3000/api/passkey/register/start
    (无 CORS 问题，同源策略不适用)
    ↓
后端处理 (localhost:3000)
    ↓
返回注册选项 (包含 challenge)
    ↓
前端继续处理，发送 clientOrigin = https://api.hapxs.com
    ↓
后端使用 https://api.hapxs.com 作为 RP_ORIGIN 验证 Passkey
```

### 生产环境 (`https://tts.hapx.one`)

```
前端应用 (tts.hapx.one)
    ↓
Passkey API 请求 → https://api.hapxs.com/api/passkey/register/start
    (不同域名，但 CORS 配置允许)
    ↓
后端处理 (api.hapxs.com)
    ↓
返回注册选项 (包含 challenge)
    ↓
前端继续处理，发送 clientOrigin = https://api.hapxs.com
    ↓
后端使用 https://api.hapxs.com 作为 RP_ORIGIN 验证 Passkey
```

---

## 关键要点

### 1️⃣ **两个不同的概念**

| 项目     | getPasskeyApiBase()     | getPasskeyOrigin()        |
| -------- | ----------------------- | ------------------------- |
| 目的     | API 请求的目标地址      | 发送给后端的 clientOrigin |
| 开发环境 | `http://localhost:3000` | `https://api.hapxs.com`   |
| 生产环境 | `https://api.hapxs.com` | `https://api.hapxs.com`   |
| 用途     | 网络请求路由            | Passkey 验证              |

### 2️⃣ **clientOrigin 始终生产值的原因**

- Passkey 是基于 origin 绑定的
- 如果 clientOrigin 在开发和生产中不同，Passkey 会认为是不同的源
- 为了保证跨环境的 Passkey 一致性，clientOrigin 必须统一为 `https://api.hapxs.com`

### 3️⃣ **为什么 API 请求在开发中使用本地地址**

- 浏览器的同源策略会阻止跨域请求（除非有 CORS 头）
- 在开发环境中，前后端通常运行在不同的端口
- 使用本地地址避免了 CORS 的复杂配置

---

## 测试步骤

### 开发环境测试

1. 启动后端：`npm run dev` (运行在 `http://localhost:3000`)
2. 启动前端：`npm run dev` (运行在 `http://localhost:3001`)
3. 尝试注册 Passkey
4. 打开浏览器 Network 标签，查看请求
   - 应该看到请求发往 `http://localhost:3000/api/passkey/register/start`
   - 不应该有 CORS 错误
5. 查看请求体中的 `clientOrigin` 应该是 `https://api.hapxs.com`

### 生产环境验证

1. 在生产环境访问 `https://tts.hapx.one`
2. 尝试注册 Passkey
3. 查看 Network 标签中的请求
   - 应该看到请求发往 `https://api.hapxs.com/api/passkey/register/start`
   - 应该有适当的 CORS 头

---

## 常见问题

### Q: 为什么在生产环境中 API 请求不使用本地地址？

**A**: 因为生产环境下前后端可能部署在不同的服务器上。使用生产的 API 地址是必要的。

### Q: 如果我在生产环境遇到 CORS 错误怎么办？

**A**: 检查后端的 CORS 配置是否包含了前端的域名。在 `src/config/env.ts` 的 `ALLOWED_ORIGINS` 中添加你的前端域名。

### Q: clientOrigin 发送的值会影响 Passkey 吗？

**A**: 是的。clientOrigin 用于后端验证 Passkey 的来源。如果值不正确，验证会失败。

---

## 相关配置检查清单

- [ ] `getPasskeyApiBase()` 在开发环境返回 `http://localhost:3000`
- [ ] `getPasskeyApiBase()` 在生产环境返回 `https://api.hapxs.com`
- [ ] `getPasskeyOrigin()` 始终返回 `https://api.hapxs.com`
- [ ] 所有 Passkey API 调用使用 `getPasskeyApiBase()`
- [ ] 所有请求都传递 `clientOrigin: getClientOrigin()`
- [ ] 后端 CORS 配置包含所有允许的前端域名

---

## 总结

通过动态路由 API 请求并保持 clientOrigin 一致，我们实现了：

✅ 开发环境避免 CORS 问题  
✅ 生产环境保证 Passkey 一致性  
✅ 跨环境支持  
✅ 清晰的代码意图

---

**实现完成** ✅
