---
title: Passkey RP_ORIGIN 动态获取 - 快速开始
date: 2025-11-06
slug: passkey-quick-start
tags: [passkey, quick-start, guide, configuration]
---

# Passkey RP_ORIGIN 动态获取 - 快速开始

## 🚀 5 分钟快速上手

### 1️⃣ 什么是这个功能？

您的应用现在能够**自动从用户浏览器地址栏获取域名**，并用于 Passkey 认证。这支持在多个域名上部署同一个应用。

### 2️⃣ 我需要做什么？

**好消息**: 如果您使用默认配置（`RP_ORIGIN_MODE=fixed`），**无需做任何改动**！

应用会像之前一样工作，只是现在支持更多部署场景。

### 3️⃣ 想要支持多域名？

只需 3 步：

**步骤 1**: 编辑 `.env` 文件

```bash
# 原始配置保持不变
RP_ID=tts.hapx.one
RP_ORIGIN=https://tts.hapx.one

# 新增这两行
RP_ORIGIN_MODE=dynamic
ALLOWED_ORIGINS=https://tts.hapx.one,https://tts.example.com,http://localhost:3000
```

**步骤 2**: 重启应用

```bash
npm run dev
# 或
docker-compose restart
```

**步骤 3**: 测试

在不同域名上注册 Passkey，然后在其他允许的域名上使用它。

---

## 📋 配置速查表

### 单域名部署（推荐默认配置）

```env
# 无需添加新配置，使用默认值
# 或显式设置：
RP_ORIGIN_MODE=fixed
RP_ORIGIN=https://app.example.com
```

### 多域名部署

```env
RP_ID=example.com  # ⚠️ 必须与所有 origin 的域名部分一致
RP_ORIGIN=https://app.example.com  # 默认值（备选）
RP_ORIGIN_MODE=dynamic
ALLOWED_ORIGINS=https://app.example.com,https://app2.example.com,https://staging.example.com
```

### 本地开发

```env
RP_ID=localhost
RP_ORIGIN=http://localhost:3000
RP_ORIGIN_MODE=dynamic
ALLOWED_ORIGINS=http://localhost:3000,http://127.0.0.1:3000,http://localhost:5173
```

---

## 🔍 如何验证配置是否生效？

### 方法 1: 查看日志

```bash
# 查看应用启动时的 RP_ORIGIN 配置
grep -i "rp_origin\|rp_id" logs/combined.log

# 查看 Passkey 请求中的 clientOrigin
grep -i "clientOrigin" logs/combined.log
```

### 方法 2: 测试 API

```bash
# 测试注册开始
curl -X POST http://localhost:3000/api/passkey/register/start \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{"credentialName":"Test","clientOrigin":"http://localhost:3000"}'

# 查看响应中的 challenge
```

---

## ⚠️ 常见错误

### ❌ 错误 1: "Passkey 认证失败"

**原因**: RP_ORIGIN 不匹配

**解决**:

```bash
# 检查当前使用的域名
# 例如: https://staging.example.com

# 检查 ALLOWED_ORIGINS 是否包含它
grep ALLOWED_ORIGINS .env
# 应该看到: ALLOWED_ORIGINS=https://app.example.com,https://staging.example.com,...

# 如果不包含，添加它并重启
```

### ❌ 错误 2: "RP_ID 不匹配"

**原因**: RP_ID 不是所有 origin 的公共域名部分

**解决**:

```bash
# 原始: ALLOWED_ORIGINS=https://app1.example.com,https://app2.other.com
# RP_ID=example.com  ❌ 不行，other.com 不匹配

# 改为:
RP_ID=com  # 太宽泛，不安全
# 或改为:
RP_ID=example.com  # 仅支持 https://app1.example.com,https://app2.example.com
ALLOWED_ORIGINS=https://app1.example.com,https://app2.example.com
```

### ❌ 错误 3: "HTTP vs HTTPS 混合"

**原因**: 混合使用 HTTP 和 HTTPS 但 RP_ID 相同

**解决**:

```bash
# 在 WebAuthn 中，http://localhost 和 https://localhost 是不同的
# 可以在开发环境同时支持：
ALLOWED_ORIGINS=http://localhost:3000,http://127.0.0.1:3000

# 但生产环境必须是 HTTPS：
RP_ORIGIN_MODE=fixed
RP_ORIGIN=https://app.example.com
```

---

## 📊 工作流程

### 固定模式（Fixed Mode）

```
用户访问 https://app.example.com
    ↓
前端发送 clientOrigin=https://app.example.com
    ↓
后端接收但忽略 clientOrigin
    ↓
后端使用配置的 RP_ORIGIN=https://app.example.com
    ↓
Passkey 认证成功
```

### 动态模式（Dynamic Mode）

```
用户访问 https://app2.example.com
    ↓
前端发送 clientOrigin=https://app2.example.com
    ↓
后端验证 clientOrigin 是否在 ALLOWED_ORIGINS 中
    ↓
验证通过 ✓ → 使用 clientOrigin=https://app2.example.com
验证失败 ✗ → 使用默认 RP_ORIGIN
    ↓
Passkey 认证成功
```

---

## 🔐 安全建议

1. **始终使用 HTTPS** （生产环境）

   ```bash
   # ❌ 不安全（生产环境）
   RP_ORIGIN=http://app.example.com

   # ✅ 安全
   RP_ORIGIN=https://app.example.com
   ```

2. **明确指定允许的 origin**

   ```bash
   # ❌ 过于宽泛
   ALLOWED_ORIGINS=https://example.com

   # ✅ 明确
   ALLOWED_ORIGINS=https://app.example.com,https://staging.example.com
   ```

3. **限制允许的 origin 数量**
   - 避免在 ALLOWED_ORIGINS 中添加过多不必要的域名
   - 定期审查并删除已停用的域名

---

## 📈 迁移检查清单

- [ ] 理解您当前使用的模式（fixed 还是 dynamic）
- [ ] 备份当前 `.env` 文件
- [ ] 测试新配置
- [ ] 验证 Passkey 认证仍然有效
- [ ] 检查日志中是否有错误
- [ ] 如果一切正常，部署到生产环境

---

## 💡 小提示

### 提示 1: 在开发中测试多域名

使用 `/etc/hosts` 配置虚拟域名：

```bash
# 编辑 /etc/hosts
127.0.0.1 localhost.test
127.0.0.1 staging.test

# 在浏览器中访问
http://localhost.test:3000  ✓
http://staging.test:3000    ✓
```

### 提示 2: 查看完整的请求和响应

启用调试日志：

```bash
LOG_LEVEL=debug npm run dev
```

### 提示 3: Docker Compose 中的环境变量

```yaml
services:
  app:
    environment:
      RP_ORIGIN_MODE: dynamic
      ALLOWED_ORIGINS: https://app.example.com,https://staging.example.com
```

---

## 🆘 获取帮助

### 检查日志

```bash
# 查看最近的 Passkey 相关日志
tail -100 logs/combined.log | grep -i passkey

# 查看 origin 相关的日志
tail -100 logs/combined.log | grep -i "origin\|ALLOWED"
```

### 测试端点

```bash
# 检查当前 RP_ORIGIN 配置（需要认证）
curl -H "Authorization: Bearer TOKEN" \
  http://localhost:3000/api/passkey/credentials

# 查看是否返回凭证列表（表示认证成功）
```

### 查看详细文档

- 完整配置指南: `PASSKEY_RP_ORIGIN_CONFIG.md`
- 实现细节: `PASSKEY_IMPLEMENTATION_SUMMARY.md`

---

## ✅ 快速检查列表

在进行任何配置更改之前，确认：

- [ ] 当前应用正常运行
- [ ] Passkey 认证功能正常
- [ ] 已备份现有配置
- [ ] 理解您要配置的模式（single-domain 或 multi-domain）

---

## 🎉 完成！

现在您已经准备好使用动态 RP_ORIGIN 功能了！

**没有其他要做的 - 前端和后端都已自动配置好了。**

只需管理 `.env` 文件中的 `RP_ORIGIN_MODE` 和 `ALLOWED_ORIGINS` 即可。

---

**需要帮助?** 查看完整文档或检查日志输出。
