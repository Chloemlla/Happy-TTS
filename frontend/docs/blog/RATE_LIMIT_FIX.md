---
title: 重复请求和 429 错误修复方案
date: 2025-06-28
slug: RATE_LIMIT_FIX
---

# 重复请求和 429 错误修复方案

## 问题描述

从日志中可以看到，前端频繁发送 `GET /api/auth/me` 请求，导致返回 429 状态码（Too Many Requests）。这主要是由于以下原因：

1. **前端自动重试机制**：axios 拦截器在收到 429 错误时会自动重试
2. **useEffect 依赖项问题**：导致多次触发认证检查
3. **速率限制过于严格**：每分钟 60 次请求的限制可能不够宽松

## 修复方案

### 1. 前端修复 (`frontend/src/hooks/useAuth.ts`)

#### 移除自动重试逻辑

```typescript
// 修改前：自动重试429错误
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 429) {
      return new Promise((resolve) => {
        setTimeout(() => {
          resolve(api(error.config));
        }, 2000);
      });
    }
    return Promise.reject(error);
  }
);

// 修改后：直接返回错误
api.interceptors.response.use(
  (response) => response,
  (error) => {
    return Promise.reject(error);
  }
);
```

#### 优化认证检查逻辑

- 使用 `useRef` 来跟踪检查状态，避免闭包问题
- 使用 `useCallback` 来稳定函数引用
- 添加更严格的时间间隔检查
- 使用 `setInterval` 替代 `useEffect` 依赖项触发

```typescript
const checkAuth = useCallback(async () => {
  if (checkingRef.current) return;

  const now = Date.now();
  const timeSinceLastCheck = now - lastCheckRef.current;
  const timeSinceLastError = now - lastErrorRef.current;

  // 检查时间间隔
  if (
    timeSinceLastCheck < CHECK_INTERVAL ||
    timeSinceLastError < ERROR_RETRY_INTERVAL
  ) {
    return;
  }

  // ... 认证检查逻辑
}, [isAdminChecked, location.pathname, navigate]);
```

#### 429 错误处理优化

```typescript
if (error.response?.status === 429) {
  // 429错误不清理用户状态，只是记录错误时间
  console.warn("认证检查被限流，将在60秒后重试");
} else {
  // 其他错误才清理用户状态
  setUser(null);
  localStorage.removeItem("token");
}
```

### 2. 后端修复 (`src/app.ts`)

#### 优化速率限制配置

```typescript
// 修改前：每分钟60次请求
const meEndpointLimiter = rateLimit({
  windowMs: 60 * 1000, // 1分钟
  max: 60, // 限制每个IP每分钟60次请求
  // ...
});

// 修改后：每5分钟300次请求（平均每分钟60次，但更宽松）
const meEndpointLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5分钟
  max: 300, // 限制每个IP每5分钟300次请求
  // ...
});
```

## 修复效果

1. **减少重复请求**：通过移除自动重试和优化检查逻辑，大幅减少不必要的请求
2. **更宽松的速率限制**：5 分钟窗口期允许短时间内的请求峰值
3. **更好的错误处理**：429 错误不会导致用户状态被清理
4. **更稳定的检查机制**：使用 `setInterval` 替代依赖项触发，避免频繁重新检查

## 监控建议

1. 监控 `/api/auth/me` 端点的请求频率
2. 观察 429 错误的发生率
3. 检查前端控制台是否有重复的认证检查日志

## 测试建议

1. 打开浏览器开发者工具，观察网络请求
2. 检查是否有重复的 `/api/auth/me` 请求
3. 验证 429 错误是否得到正确处理
4. 确认用户认证状态是否正常维护
