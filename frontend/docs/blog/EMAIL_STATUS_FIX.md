# 邮件系统状态检查优化

## 问题描述

之前的邮件系统存在以下问题：

1. 每次前端请求邮件服务状态时，都会重新检查API连接
2. 状态检查耗时较长，影响用户体验
3. 状态不稳定，可能出现前后不一致的情况

## 解决方案

### 1. 启动时固定状态

在服务器启动时进行邮件服务状态检查，并将结果保存到全局变量中：

```typescript
// 邮件服务状态全局变量
var EMAIL_SERVICE_STATUS: { available: boolean; error?: string };
var OUTEMAIL_SERVICE_STATUS: { available: boolean; error?: string };

// 启动时检查邮件服务状态
(async () => {
  try {
    const { EmailService } = require("./services/emailService");
    const status = await EmailService.getServiceStatus();
    (globalThis as any).EMAIL_SERVICE_STATUS = status;
    // ... 状态检查逻辑
  } catch (error) {
    // ... 错误处理
  }
})();
```

### 2. 服务方法优化

修改邮件服务方法，优先使用启动时固定的状态：

```typescript
static async getServiceStatus(): Promise<{ available: boolean; error?: string }> {
  // 优先使用启动时固定的状态
  if ((globalThis as any).EMAIL_SERVICE_STATUS) {
    return (globalThis as any).EMAIL_SERVICE_STATUS;
  }

  // 如果没有固定状态，则进行动态检查（兼容旧版本）
  // ... 动态检查逻辑
}
```

### 3. 发送前状态检查

在所有邮件发送方法中添加状态检查：

```typescript
static async sendEmail(emailData: EmailData): Promise<EmailResponse> {
  // 检查邮件服务是否启用
  if (!(globalThis as any).EMAIL_ENABLED) {
    return { success: false, error: '邮件服务未启用' };
  }

  // 检查邮件服务状态
  const serviceStatus = (globalThis as any).EMAIL_SERVICE_STATUS;
  if (serviceStatus && !serviceStatus.available) {
    return { success: false, error: serviceStatus.error || '邮件服务不可用' };
  }

  // ... 发送逻辑
}
```

## 改进效果

### 1. 性能提升

- 启动时一次性检查，避免重复API调用
- 前端请求响应速度显著提升
- 减少服务器资源消耗

### 2. 状态一致性

- 服务状态在启动时确定，运行期间保持一致
- 避免前后端状态不一致的问题
- 提供更可靠的状态信息

### 3. 用户体验改善

- 前端状态显示更加稳定
- 减少状态切换的闪烁
- 提供更准确的错误信息

## 新增功能

### 1. 对外邮件服务状态API

新增 `/api/email/outemail-status` 接口，用于查询对外邮件服务状态：

```typescript
router.get("/outemail-status", statusQueryLimiter, (req, res) => {
  try {
    const outemailStatus = (globalThis as any).OUTEMAIL_SERVICE_STATUS;
    if (outemailStatus) {
      res.json({
        success: true,
        available: outemailStatus.available,
        error: outemailStatus.error,
      });
    } else {
      res.json({
        success: true,
        available: false,
        error: "对外邮件服务状态未初始化",
      });
    }
  } catch (error) {
    // ... 错误处理
  }
});
```

### 2. 前端状态显示优化

OutEmail组件现在会显示真实的服务状态：

```typescript
const [outemailStatus, setOutemailStatus] = useState<{
  available: boolean;
  error?: string;
} | null>(null);

useEffect(() => {
  fetch("/api/email/outemail-status")
    .then((res) => res.json())
    .then((data) => {
      if (data.success) {
        setOutemailStatus({
          available: data.available,
          error: data.error,
        });
      }
    });
}, []);
```

## 测试验证

### 1. 测试脚本

创建了 `scripts/test-email-status.js` 测试脚本：

```bash
# 运行测试
node scripts/test-email-status.js

# 使用自定义API地址
API_BASE_URL=http://your-api.com node scripts/test-email-status.js
```

### 2. 测试内容

- 邮件服务状态检查
- 对外邮件服务状态检查
- 邮件发送功能测试
- 错误处理验证

## 兼容性说明

- 保持向后兼容，旧版本代码仍可正常工作
- 新增的状态检查不会影响现有功能
- 如果启动时状态检查失败，会降级到动态检查

## 配置要求

确保以下环境变量正确配置：

```bash
# 邮件服务配置
RESEND_API_KEY=your_resend_api_key
RESEND_DOMAIN=hapxs.com

# 对外邮件服务配置
OUTEMAIL_ENABLED=true
OUTEMAIL_DOMAIN=arteam.dev
OUTEMAIL_API_KEY=your_outemail_api_key
OUTEMAIL_CODE=your_verification_code
```

## 总结

通过启动时固定邮件系统状态，我们实现了：

1. **性能优化**：减少重复API调用，提升响应速度
2. **状态稳定**：确保服务状态在运行期间保持一致
3. **用户体验**：提供更稳定、准确的状态显示
4. **功能完善**：新增对外邮件服务状态检查

这些改进使得邮件系统更加可靠和高效，为用户提供了更好的使用体验。
