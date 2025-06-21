# 测试文档

## 概述

本项目包含针对认证和速率限制功能的 Jest 测试，确保我们修复的重复请求和 429 错误问题得到正确处理。

## 测试文件

### 1. `authController.test.ts`

测试 AuthController 的认证功能：

- 本地 IP 自动获取管理员信息
- Token 验证和用户信息获取
- 错误处理（401、403、404）
- 本地 IP 识别逻辑

### 2. `rateLimit.test.ts`

测试速率限制配置：

- `/api/auth/me` 端点的限流器配置
- 本地 IP 跳过限制的逻辑
- IP 密钥生成
- 新旧配置对比验证

### 3. `useAuth.test.ts`

测试前端认证逻辑：

- 429 错误处理
- 时间间隔检查逻辑
- 防重复请求机制
- Token 验证
- 错误处理策略

### 4. `totpService.test.ts`

测试 TOTP 服务功能（已存在）：

- TOTP 密钥生成
- 令牌验证
- 备用恢复码处理

## 运行测试

### 运行所有测试

```bash
npm test
```

### 运行特定测试

```bash
# 认证控制器测试
npm run test:auth

# 速率限制测试
npm run test:rate-limit

# 监听模式
npm run test:watch

# 生成覆盖率报告
npm run test:coverage
```

## 测试覆盖率

运行 `npm run test:coverage` 将生成详细的覆盖率报告，包括：

- 语句覆盖率
- 分支覆盖率
- 函数覆盖率
- 行覆盖率

## 测试重点

### 1. 速率限制修复验证

- ✅ 验证新的 5 分钟窗口期配置
- ✅ 验证 300 次请求限制
- ✅ 验证本地 IP 跳过限制
- ✅ 验证错误消息格式

### 2. 认证逻辑验证

- ✅ 验证 429 错误不清理用户状态
- ✅ 验证防重复请求机制
- ✅ 验证时间间隔检查
- ✅ 验证 Token 格式验证

### 3. 错误处理验证

- ✅ 验证不同类型错误的处理策略
- ✅ 验证重试逻辑
- ✅ 验证用户状态清理逻辑

## 测试环境

- **测试框架**: Jest
- **语言**: TypeScript
- **环境**: Node.js
- **覆盖率工具**: Jest 内置覆盖率

## 注意事项

1. 测试使用模拟（Mock）来隔离依赖
2. 所有测试都是独立的，不依赖外部服务
3. 测试覆盖了主要的边界情况和错误场景
4. 测试验证了我们修复的核心功能

## 持续集成

建议在 CI/CD 流程中包含这些测试：

```yaml
# 示例 GitHub Actions 配置
- name: Run Tests
  run: npm test

- name: Generate Coverage Report
  run: npm run test:coverage
```
