---
title: LibreChat Turnstile 人机验证集成
date: 2025-08-27
slug: librechat-turnstile-integration
tags: [librechat, turnstile, verification, security, user-experience, blog]
---

# LibreChat Turnstile 人机验证集成

## 问题背景

在 Synapse 项目的 LibreChat 聊天功能中，需要为普通用户添加人机验证机制，以防止恶意使用和滥用：

1. **安全需求**：防止机器人恶意发送消息
2. **资源保护**：避免 AI 资源被滥用
3. **用户体验**：管理员用户无需验证，普通用户需要验证
4. **合规要求**：满足内容安全和使用规范要求

## 解决方案

### 1. 用户角色区分

根据用户角色决定是否需要 Turnstile 验证：

```typescript
// 检查用户是否为管理员
const isAdmin = useMemo(() => {
  const userRole = localStorage.getItem("userRole");
  return userRole === "admin" || userRole === "administrator";
}, []);
```

### 2. Turnstile 状态管理

添加 Turnstile 相关的状态管理：

```typescript
// Turnstile 相关状态
const { config: turnstileConfig, loading: turnstileConfigLoading } =
  useTurnstileConfig();
const [turnstileToken, setTurnstileToken] = useState<string>("");
const [turnstileVerified, setTurnstileVerified] = useState(false);
const [turnstileError, setTurnstileError] = useState(false);
const [turnstileKey, setTurnstileKey] = useState(0);
```

### 3. 验证处理函数

实现 Turnstile 验证的回调函数：

```typescript
// Turnstile 验证处理函数
const handleTurnstileVerify = (token: string) => {
  setTurnstileToken(token);
  setTurnstileVerified(true);
  setTurnstileError(false);
};

const handleTurnstileExpire = () => {
  setTurnstileToken("");
  setTurnstileVerified(false);
  setTurnstileError(false);
};

const handleTurnstileError = () => {
  setTurnstileToken("");
  setTurnstileVerified(false);
  setTurnstileError(true);
};
```

### 4. 发送消息验证

在发送消息前检查 Turnstile 验证状态：

```typescript
const handleSend = async () => {
  setSendError("");
  if (!message.trim()) return;

  // 检查Turnstile验证（管理员除外）
  if (
    !isAdmin &&
    !!turnstileConfig.siteKey &&
    (!turnstileVerified || !turnstileToken)
  ) {
    setSendError("请先完成人机验证");
    setNotification({ message: "请先完成人机验证", type: "warning" });
    return;
  }

  // ... 其他发送逻辑
};
```

### 5. 请求体构建

在发送请求时包含 Turnstile 验证 token：

```typescript
// 构建请求体
const requestBody: any = token
  ? { token, message: toSend }
  : { message: toSend };

// 如果不是管理员且Turnstile已启用，添加验证token
if (!isAdmin && !!turnstileConfig.siteKey && turnstileToken) {
  requestBody.cfToken = turnstileToken;
}

const res = await fetch(`${apiBase}/api/librechat/send`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  credentials: "include",
  body: JSON.stringify(requestBody),
});
```

### 6. 状态重置

发送成功后重置 Turnstile 状态：

```typescript
setMessage("");

// 重置Turnstile状态
if (!isAdmin) {
  setTurnstileToken("");
  setTurnstileVerified(false);
  setTurnstileKey((k) => k + 1);
}
```

### 7. UI 组件集成

在发送消息区域添加 Turnstile 组件：

```typescript
{/* Turnstile 人机验证（非管理员用户） */}
{!isAdmin && !turnstileConfigLoading && turnstileConfig.siteKey && typeof turnstileConfig.siteKey === 'string' && (
  <motion.div
    className="mt-4 p-4 bg-gray-50 rounded-lg border border-gray-200"
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.5 }}
  >
    <div className="text-sm text-gray-700 mb-3 text-center">
      人机验证
      {turnstileVerified && (
        <span className="ml-2 text-green-600 font-medium">✓ 验证通过</span>
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
  </motion.div>
)}
```

### 8. 按钮状态控制

根据验证状态控制发送按钮的启用状态：

```typescript
<motion.button
  onClick={handleSend}
  disabled={sending || (!isAdmin && !!turnstileConfig.siteKey && !turnstileVerified)}
  className="px-6 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition font-medium flex items-center gap-2 disabled:opacity-50"
  whileTap={{ scale: 0.95 }}
>
  <FaPaperPlane className="w-4 h-4" />
  {sending ? '发送中...' : '发送'}
</motion.button>
```

## 实现细节

### 1. 用户角色判断

- **管理员用户**：`userRole === 'admin' || userRole === 'administrator'`
- **普通用户**：其他角色或未设置角色
- **游客用户**：未登录用户

### 2. 验证流程

1. **检查用户角色**：如果是管理员，跳过验证
2. **显示验证组件**：非管理员用户显示 Turnstile 组件
3. **等待验证完成**：用户完成人机验证
4. **发送消息**：验证通过后允许发送消息
5. **重置状态**：发送成功后重置验证状态

### 3. 实时对话框支持

同样的验证逻辑也应用到实时对话框中：

```typescript
// 检查Turnstile验证（管理员除外）
if (
  !isAdmin &&
  !!turnstileConfig.siteKey &&
  (!turnstileVerified || !turnstileToken)
) {
  setRtError("请先完成人机验证");
  setNotification({ message: "请先完成人机验证", type: "warning" });
  return;
}
```

### 4. 错误处理

- **验证失败**：显示错误提示，要求重新验证
- **验证过期**：自动重置状态，要求重新验证
- **网络错误**：提供友好的错误提示

## 优化效果

### 1. 安全性提升

- **防止机器人**：有效防止自动化机器人发送消息
- **资源保护**：避免 AI 资源被恶意滥用
- **合规性**：满足内容安全和使用规范要求

### 2. 用户体验

- **管理员便利**：管理员用户无需验证，直接使用
- **普通用户友好**：简单的人机验证流程
- **状态清晰**：明确的验证状态提示

### 3. 系统稳定性

- **状态管理**：完善的验证状态管理机制
- **错误处理**：健壮的错误处理和恢复机制
- **性能优化**：验证组件按需加载

## 使用场景

### 1. 管理员用户

```typescript
// 管理员用户直接发送消息，无需验证
const adminUser = {
  userRole: "admin",
  canSendMessage: true, // 无需 Turnstile 验证
  requiresVerification: false,
};
```

### 2. 普通用户

```typescript
// 普通用户需要完成验证才能发送消息
const normalUser = {
  userRole: "user",
  canSendMessage: false, // 需要 Turnstile 验证
  requiresVerification: true,
  verificationStatus: "pending", // pending, verified, expired, error
};
```

### 3. 游客用户

```typescript
// 游客用户也需要验证
const guestUser = {
  userRole: null,
  canSendMessage: false, // 需要 Turnstile 验证
  requiresVerification: true,
  verificationStatus: "pending",
};
```

## 最佳实践

### 1. 角色管理

- **明确角色定义**：清晰定义管理员和普通用户角色
- **角色持久化**：将用户角色信息持久化存储
- **角色验证**：定期验证用户角色的有效性

### 2. 验证流程

- **用户体验优先**：确保验证流程简单易用
- **状态反馈**：提供清晰的验证状态反馈
- **错误恢复**：提供友好的错误恢复机制

### 3. 安全性

- **Token 验证**：确保 Turnstile token 的有效性
- **状态重置**：及时重置验证状态，避免重复使用
- **错误处理**：妥善处理验证失败的情况

## 监控和日志

### 1. 验证日志

```typescript
// 记录验证事件
const logVerificationEvent = (
  event: string,
  userId: string,
  success: boolean
) => {
  console.log(
    `[Turnstile] ${event}: 用户 ${userId}, 结果: ${success ? "成功" : "失败"}`
  );
};
```

### 2. 发送日志

```typescript
// 记录消息发送事件
const logMessageSend = (
  userId: string,
  userRole: string,
  requiresVerification: boolean
) => {
  console.log(
    `[LibreChat] 消息发送: 用户 ${userId}, 角色 ${userRole}, 需要验证: ${requiresVerification}`
  );
};
```

## 总结

通过集成 Turnstile 人机验证功能，我们实现了以下改进：

1. **安全性**：有效防止机器人恶意使用
2. **用户体验**：管理员用户便利，普通用户友好
3. **合规性**：满足内容安全和使用规范要求
4. **稳定性**：完善的错误处理和状态管理

这个改进不仅提升了系统的安全性，还通过角色区分优化了用户体验，是一个重要的安全功能增强。
