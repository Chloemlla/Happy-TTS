# Cloudflare Turnstile 组件使用指南

## 概述

Cloudflare Turnstile 是一个现代化的人机验证解决方案，替代了传统的 CAPTCHA。本文档详细介绍了如何在我们的项目中正确使用 Turnstile 组件。

## 组件特性

### 1. 自动脚本加载

- 组件会自动加载 Turnstile 脚本，避免重复加载
- 使用全局状态管理脚本加载状态
- 支持脚本加载失败的错误处理

### 2. 防重复渲染

- 使用 `mountedRef` 防止在同一容器中重复渲染
- 使用 `verifiedRef` 在验证成功后阻止重新渲染
- 优化了 useEffect 依赖，避免无限循环

### 3. 类型安全

- 完整的 TypeScript 类型定义
- 严格的 siteKey 类型检查
- 回调函数的类型安全

## 使用方法

### 1. 基本使用

```tsx
import { TurnstileWidget } from "./components/TurnstileWidget";
import { useTurnstileConfig } from "./hooks/useTurnstileConfig";

const MyComponent = () => {
  const { config: turnstileConfig, loading: turnstileConfigLoading } =
    useTurnstileConfig();
  const [turnstileToken, setTurnstileToken] = useState<string>("");
  const [turnstileVerified, setTurnstileVerified] = useState(false);
  const [turnstileError, setTurnstileError] = useState(false);
  const [turnstileKey, setTurnstileKey] = useState(0);

  // 验证成功回调
  const handleTurnstileVerify = (token: string) => {
    setTurnstileToken(token);
    setTurnstileVerified(true);
    setTurnstileError(false);
  };

  // 验证过期回调
  const handleTurnstileExpire = () => {
    setTurnstileToken("");
    setTurnstileVerified(false);
    setTurnstileError(false);
  };

  // 验证错误回调
  const handleTurnstileError = () => {
    setTurnstileToken("");
    setTurnstileVerified(false);
    setTurnstileError(true);
  };

  return (
    <div>
      {/* 条件渲染：确保配置加载完成且 siteKey 存在 */}
      {!turnstileConfigLoading &&
        turnstileConfig.siteKey &&
        typeof turnstileConfig.siteKey === "string" && (
          <div className="turnstile-container">
            <div className="text-sm text-gray-700 mb-3 text-center">
              人机验证
              {turnstileVerified && (
                <span className="ml-2 text-green-600 font-medium">
                  ✓ 验证通过
                </span>
              )}
            </div>

            <TurnstileWidget
              key={turnstileKey}
              siteKey={turnstileConfig.siteKey}
              onVerify={handleTurnstileVerify}
              onExpire={handleTurnstileExpire}
              onError={handleTurnstileError}
              theme="light"
              size="normal"
            />

            {turnstileError && (
              <div className="mt-2 text-sm text-red-500 text-center">
                验证失败，请重新验证
              </div>
            )}
          </div>
        )}

      {/* 表单按钮：根据验证状态禁用 */}
      <button disabled={!turnstileVerified} onClick={handleSubmit}>
        提交
      </button>
    </div>
  );
};
```

### 2. 表单集成

```tsx
const handleSubmit = async () => {
  // 检查验证状态
  if (!!turnstileConfig.siteKey && (!turnstileVerified || !turnstileToken)) {
    setError("请先完成人机验证");
    return;
  }

  // 构建请求数据
  const formData = new FormData();
  formData.append("data", "your-data");

  // 条件添加 Turnstile token
  if (!!turnstileConfig.siteKey && turnstileToken) {
    formData.append("cfToken", turnstileToken);
  }

  // 发送请求
  const response = await fetch("/api/endpoint", {
    method: "POST",
    body: formData,
  });

  // 处理响应后重置验证状态
  if (response.ok) {
    setTurnstileToken("");
    setTurnstileVerified(false);
    setTurnstileKey((k) => k + 1);
  }
};
```

### 3. 状态重置

```tsx
// 切换表单模式时重置
const handleModeSwitch = () => {
  setIsLogin(!isLogin);
  setError(null);

  // 重置 Turnstile 状态
  setTurnstileToken("");
  setTurnstileVerified(false);
  setTurnstileError(false);
  setTurnstileKey((k) => k + 1);
};

// 提交成功后重置
const handleSuccess = () => {
  setTurnstileToken("");
  setTurnstileVerified(false);
  setTurnstileKey((k) => k + 1);
};
```

## 注意事项

### 1. 条件渲染检查

**正确做法：**

```tsx
{!turnstileConfigLoading && turnstileConfig.siteKey && typeof turnstileConfig.siteKey === 'string' && (
  <TurnstileWidget ... />
)}
```

**错误做法：**

```tsx
{turnstileConfig.enabled && turnstileConfig.siteKey && (
  <TurnstileWidget ... />
)}
```

### 2. 按钮禁用条件

**正确做法：**

```tsx
disabled={!file || uploading || (!!turnstileConfig.siteKey && !turnstileVerified)}
```

**错误做法：**

```tsx
disabled={!file || uploading || (turnstileConfig.enabled && !turnstileVerified)}
```

### 3. 验证检查

**正确做法：**

```tsx
if (!!turnstileConfig.siteKey && (!turnstileVerified || !turnstileToken)) {
  // 显示错误
  return;
}
```

**错误做法：**

```tsx
if (turnstileConfig.enabled && (!turnstileVerified || !turnstileToken)) {
  // 显示错误
  return;
}
```

### 4. Token 传递

**正确做法：**

```tsx
if (!!turnstileConfig.siteKey && turnstileToken) {
  formData.append("cfToken", turnstileToken);
}
```

**错误做法：**

```tsx
if (turnstileConfig.enabled && turnstileToken) {
  formData.append("cfToken", turnstileToken);
}
```

## 常见问题

### 1. 组件重复渲染

**问题：** Turnstile 组件不断重新渲染，显示"正在验证"

**解决方案：**

- 确保使用 `key` 属性控制组件重新渲染
- 检查 useEffect 依赖项，避免无限循环
- 使用 `verifiedRef` 在验证成功后阻止重新渲染

### 2. 验证成功后按钮仍禁用

**问题：** 用户完成验证后，提交按钮仍然处于禁用状态

**解决方案：**

- 检查 `onVerify` 回调是否正确设置状态
- 确保 `turnstileVerified` 状态正确更新
- 验证按钮的 `disabled` 条件逻辑

### 3. 类型错误

**问题：** TypeScript 报错 `Type 'string | null' is not assignable to type 'string'`

**解决方案：**

- 添加类型检查：`typeof turnstileConfig.siteKey === 'string'`
- 使用双重否定：`!!turnstileConfig.siteKey`

### 4. CSP 错误

**问题：** 控制台显示 CSP 错误，Turnstile 无法加载

**解决方案：**

- 在 `index.html` 中添加 CSP 配置
- 在 `app.ts` 中配置 Helmet CSP
- 允许 `https://challenges.cloudflare.com` 和 `https://*.cloudflare.com`

## 最佳实践

### 1. 状态管理

- 使用 `useState` 管理验证状态
- 使用 `useRef` 管理组件内部状态
- 及时重置状态，避免状态污染

### 2. 错误处理

- 提供清晰的错误提示
- 支持重新验证机制
- 记录错误日志便于调试

### 3. 用户体验

- 显示验证状态指示器
- 提供验证成功/失败的视觉反馈
- 优化加载和错误状态的显示

### 4. 性能优化

- 避免不必要的重新渲染
- 合理使用 `key` 属性
- 优化 useEffect 依赖项

## 配置要求

### 1. 环境变量

```env
TURNSTILE_SECRET_KEY=your_secret_key_here
TURNSTILE_SITE_KEY=your_site_key_here
```

### 2. CSP 配置

```html
<!-- index.html -->
<meta
  http-equiv="Content-Security-Policy"
  content="
  frame-src 'self' https://challenges.cloudflare.com https://*.cloudflare.com;
  script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com;
"
/>
```

```typescript
// app.ts
contentSecurityPolicy: {
  directives: {
    frameSrc: ["'self'", "https://challenges.cloudflare.com", "https://*.cloudflare.com"],
    scriptSrc: ["'self'", "'unsafe-inline'", "https://challenges.cloudflare.com"],
  },
}
```

### 3. API 路由

```typescript
// 确保后端有对应的配置接口
app.get("/api/tts/turnstile/config", (req, res) => {
  res.json({
    enabled: !!process.env.TURNSTILE_SECRET_KEY,
    siteKey: process.env.TURNSTILE_SITE_KEY,
  });
});
```

## 总结

正确使用 Turnstile 组件需要注意以下几点：

1. **条件渲染**：使用 `!!turnstileConfig.siteKey` 而不是 `turnstileConfig.enabled`
2. **类型检查**：添加 `typeof turnstileConfig.siteKey === 'string'` 检查
3. **状态管理**：正确管理验证状态，及时重置
4. **错误处理**：提供完善的错误处理和用户反馈
5. **性能优化**：避免无限循环和重复渲染

遵循这些指导原则，可以确保 Turnstile 组件稳定可靠地工作，为用户提供良好的验证体验。
