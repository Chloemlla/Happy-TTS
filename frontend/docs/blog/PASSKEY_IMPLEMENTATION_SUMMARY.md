---
title: Passkey RP_ORIGIN 动态获取实现总结
date: 2025-11-06
slug: passkey-rp-origin-implementation
tags: [passkey, rp-origin, multi-domain, implementation]
---

# Passkey RP_ORIGIN 动态获取实现总结

**完成日期**: 2025-11-06  
**目标**: 实现前后端自动从用户浏览器地址栏获取 RP_ORIGIN，支持多域名部署

## 变更概览

### 📋 前端改动

#### 1. `frontend/src/api/passkey.ts`

**新增功能**:

- `getClientOrigin()` - 从 `window.location` 自动获取当前域名
  - 格式: `https://domain.com` 或 `http://localhost:3000`
  - 包含协议和端口，但不包含路径

**所有 API 调用现在包含 `clientOrigin`**:

```typescript
passkeyApi.startRegistration(credentialName); // POST: { credentialName, clientOrigin }
passkeyApi.finishRegistration(credentialName, resp); // POST: { credentialName, response, clientOrigin }
passkeyApi.startAuthentication(username); // POST: { username, clientOrigin }
passkeyApi.finishAuthentication(username, resp); // POST: { username, response, clientOrigin }
```

---

### 📋 后端改动

#### 1. `src/config/env.ts`

**新增配置**:

```typescript
RP_ORIGIN_MODE: "fixed" | "dynamic"; // 模式选择，默认 'fixed'
ALLOWED_ORIGINS: string; // 允许的 origin 列表（逗号分隔）
```

**配置说明**:

- `RP_ORIGIN_MODE=fixed` (默认): 使用配置的固定 RP_ORIGIN
- `RP_ORIGIN_MODE=dynamic`: 从客户端请求中动态获取，验证白名单后使用

#### 2. `src/services/passkeyService.ts`

**新增辅助函数**:

```typescript
// 提取 origin 的主机名
extractHostFromOrigin(origin: string): string

// 验证 clientOrigin 是否在允许列表中
isOriginAllowed(clientOrigin: string): boolean

// 获取 RP_ORIGIN（支持动态和固定模式）
getRpOrigin(clientOrigin?: string): string
```

**更新的方法签名**:

```typescript
// 生成注册选项 - 新增 clientOrigin 参数
generateRegistrationOptions(user, credentialName, clientOrigin?)

// 验证注册 - 新增 clientOrigin 参数
verifyRegistration(user, response, credentialName, clientOrigin?, requestOrigin?)

// 生成认证选项 - 新增 clientOrigin 参数
generateAuthenticationOptions(user, clientOrigin?)

// 验证认证 - 新增 clientOrigin 参数
verifyAuthentication(user, response, clientOrigin?, requestOrigin?, retryCount?)
```

#### 3. `src/routes/passkeyRoutes.ts`

**所有路由已更新以处理 `clientOrigin`**:

| 路由                   | 方法 | 变化                      |
| ---------------------- | ---- | ------------------------- |
| `/register/start`      | POST | 接收并传递 `clientOrigin` |
| `/register/finish`     | POST | 接收并传递 `clientOrigin` |
| `/authenticate/start`  | POST | 接收并传递 `clientOrigin` |
| `/authenticate/finish` | POST | 接收并传递 `clientOrigin` |

**日志增强**:

- 所有路由现在记录接收到的 `clientOrigin`
- 动态模式验证的结果被记录到日志

---

## 功能特性

### ✅ 固定模式（默认、推荐单域名部署）

```bash
RP_ORIGIN_MODE=fixed
RP_ORIGIN=https://app.example.com
```

**行为**:

- 忽略客户端发送的 `clientOrigin`
- 始终使用配置的 `RP_ORIGIN`
- 适合单一域名部署

### ✅ 动态模式（推荐多域名部署）

```bash
RP_ORIGIN_MODE=dynamic
ALLOWED_ORIGINS=https://app.example.com,https://staging.example.com,http://localhost:3000
```

**行为**:

- 验证客户端 `clientOrigin` 是否在 `ALLOWED_ORIGINS` 列表中
- 验证通过: 使用 `clientOrigin`
- 验证失败: 回退到配置的 `RP_ORIGIN`
- 白名单验证提高安全性

### ✅ 安全特性

1. **白名单验证** - 仅接受授权的 origin
2. **协议验证** - 必须包含 http:// 或 https://
3. **端口验证** - 不同端口视为不同的 origin
4. **回退机制** - 验证失败时使用配置值，确保可用性

---

## 使用指南

### 部署单域名应用

```bash
# .env 配置
RP_ID=app.example.com
RP_ORIGIN=https://app.example.com
RP_ORIGIN_MODE=fixed
```

### 部署多域名应用

```bash
# .env 配置
RP_ID=example.com  # 必须与所有 origin 的域名部分一致
RP_ORIGIN=https://app.example.com
RP_ORIGIN_MODE=dynamic
ALLOWED_ORIGINS=https://app.example.com,https://app2.example.com,https://staging.example.com
```

### 开发环境配置

```bash
# 支持本地开发
RP_ID=localhost
RP_ORIGIN=http://localhost:3000
RP_ORIGIN_MODE=dynamic
ALLOWED_ORIGINS=http://localhost:3000,http://127.0.0.1:3000,http://localhost:5173
```

---

## 文件改动详情

### 核心文件修改

| 文件                             | 行数 | 修改内容                                                   |
| -------------------------------- | ---- | ---------------------------------------------------------- |
| `frontend/src/api/passkey.ts`    | +30  | 新增 `getClientOrigin()`，所有 API 调用添加 `clientOrigin` |
| `src/config/env.ts`              | +4   | 新增 `RP_ORIGIN_MODE` 和 `ALLOWED_ORIGINS`                 |
| `src/services/passkeyService.ts` | +60  | 新增辅助函数，所有方法支持 `clientOrigin` 参数             |
| `src/routes/passkeyRoutes.ts`    | +20  | 所有路由接收并传递 `clientOrigin`                          |

### 文档文件

| 文件                                | 说明                   |
| ----------------------------------- | ---------------------- |
| `PASSKEY_RP_ORIGIN_CONFIG.md`       | 详细配置指南和使用示例 |
| `PASSKEY_IMPLEMENTATION_SUMMARY.md` | 本文件，实现总结       |

---

## 日志示例

### 固定模式日志

```
[Passkey] /register/start 收到请求 { userId: 'user1', credentialName: 'My Key', clientOrigin: undefined }
[Passkey] generateRegistrationOptions 调用底层库异常: ...
```

### 动态模式日志 - 验证通过

```
[Passkey] /register/start 收到请求 { userId: 'user1', credentialName: 'My Key', clientOrigin: 'https://app.example.com' }
[Passkey] 使用动态 RP_ORIGIN { clientOrigin: 'https://app.example.com' }
```

### 动态模式日志 - 验证失败

```
[Passkey] /register/start 收到请求 { userId: 'user1', credentialName: 'My Key', clientOrigin: 'https://evil.com' }
[Passkey] 客户端提交的 origin 不在允许列表中，使用默认值 {
  clientOrigin: 'https://evil.com',
  allowedOrigins: 'https://app.example.com,https://app2.example.com'
}
```

---

## 向后兼容性

✅ **完全向后兼容**

- 客户端可以不发送 `clientOrigin`，系统正常工作
- 服务器端 `clientOrigin` 是可选参数
- 默认模式（fixed）与之前行为完全相同
- 现有的 Passkey 凭证无需迁移

---

## 测试建议

### 单元测试

```typescript
// 测试 getClientOrigin 函数
expect(getClientOrigin()).toBe("http://localhost:3000");

// 测试 isOriginAllowed 函数
expect(isOriginAllowed("https://allowed.com")).toBe(true);
expect(isOriginAllowed("https://evil.com")).toBe(false);
```

### 集成测试

```bash
# 测试固定模式
RP_ORIGIN_MODE=fixed npm run test

# 测试动态模式
RP_ORIGIN_MODE=dynamic ALLOWED_ORIGINS=http://localhost:3000 npm run test

# 测试多域名
ALLOWED_ORIGINS=http://localhost:3000,http://127.0.0.1:3000 npm run test
```

### 手动测试

1. **单域名**:

   - 访问 `https://app.example.com`
   - 注册和认证 Passkey
   - 验证成功

2. **多域名**:
   - 使用 Passkey 在 `https://app.example.com` 注册
   - 尝试在 `https://app2.example.com` 认证
   - 应该成功（使用不同的 clientOrigin 但同一个 RP_ID）

---

## 故障排除

### 问题: Passkey 认证失败

**原因 1**: RP_ORIGIN 不匹配

```
解决: 检查环境变量 RP_ORIGIN 和 ALLOWED_ORIGINS
检查日志中的 'clientOrigin' 值
```

**原因 2**: RP_ID 不匹配

```
解决: 确保 RP_ID 与所有 origin 的域名部分一致
例如: RP_ID=example.com 支持 https://app.example.com 和 https://api.example.com
```

**原因 3**: 动态模式未配置

```
解决: 检查 RP_ORIGIN_MODE=dynamic
检查 ALLOWED_ORIGINS 是否包含当前访问的域名
```

### 调试日志

```bash
# 查看所有 Passkey 相关日志
grep -i passkey logs/combined.log

# 查看特定用户的日志
grep -i "userId: 'user1'" logs/combined.log | grep -i passkey

# 查看 origin 相关日志
grep -i "origin\|ALLOWED" logs/combined.log
```

---

## 性能影响

- **前端**: 无性能影响，`getClientOrigin()` 是轻量级操作
- **后端**: 最小化性能影响
  - `isOriginAllowed()` - O(n) 白名单查找（通常 n < 10）
  - `getRpOrigin()` - 无显著影响
- **日志**: 新增 `clientOrigin` 日志信息，占用空间不显著

---

## 未来改进

- [ ] 支持正则表达式白名单
- [ ] 动态加载 ALLOWED_ORIGINS（从数据库）
- [ ] Passkey 凭证与 origin 绑定
- [ ] 多 RP_ID 支持

---

## 相关文档

- 详细配置指南: `PASSKEY_RP_ORIGIN_CONFIG.md`
- Passkey 规范: https://webauthn.io/
- SimpleWebAuthn 文档: https://simplewebauthn.dev/

---

## 版本信息

- **实现日期**: 2025-11-06
- **版本**: 1.0.0
- **兼容性**: Node.js 14+, TypeScript 4.5+
- **依赖**: @simplewebauthn/server@13+, @simplewebauthn/browser@13+

---

**实现完成** ✅
