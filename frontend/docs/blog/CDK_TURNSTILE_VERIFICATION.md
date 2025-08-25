---
title: CDK兑换Turnstile验证实现
date: 2025-08-27
slug: cdk-turnstile-verification
tags: [cdk, turnstile, verification, security, backend, frontend, blog]
---

# CDK兑换Turnstile验证实现

## 概述

为了保护CDK兑换功能免受自动化攻击，我们为CDK兑换功能添加了Cloudflare Turnstile人机验证。非管理员用户在兑换CDK时必须完成Turnstile验证，而管理员用户则跳过验证。

## 功能特性

### 1. 用户角色区分

- **管理员用户**：跳过Turnstile验证，直接进行CDK兑换
- **普通用户**：必须完成Turnstile验证才能兑换CDK

### 2. 验证流程

1. 用户输入CDK兑换码
2. 非管理员用户完成Turnstile验证
3. 前端发送包含验证token的请求
4. 后端验证Turnstile token
5. 验证成功后进行CDK兑换

### 3. 错误处理

- Turnstile验证失败时返回具体错误信息
- 网络错误时提供友好的错误提示
- 支持验证过期和错误回调

## 后端实现

### 1. CDK服务层 (`cdkService.ts`)

扩展 `redeemCDK` 方法，添加Turnstile验证：

```typescript
async redeemCDK(
  code: string,
  userInfo?: { userId: string; username: string },
  forceRedeem?: boolean,
  cfToken?: string,
  userRole?: string
) {
  // Turnstile 验证（非管理员用户）
  const isAdmin = userRole === 'admin' || userRole === 'administrator';
  if (!isAdmin && process.env.TURNSTILE_SECRET_KEY) {
    if (!cfToken) {
      logger.warn('非管理员用户缺少 Turnstile token，拒绝CDK兑换', {
        userId: userInfo?.userId,
        userRole
      });
      throw new Error('需要完成人机验证才能兑换CDK');
    }

    try {
      // 验证 Turnstile token
      const axios = await import('axios');
      const verificationResult = await axios.default.post(
        'https://challenges.cloudflare.com/turnstile/v0/siteverify',
        {
          secret: process.env.TURNSTILE_SECRET_KEY,
          response: cfToken
        },
        {
          timeout: 10000 // 10秒超时
        }
      );

      if (!verificationResult.data.success) {
        logger.warn('Turnstile 验证失败', {
          userId: userInfo?.userId,
          userRole,
          errorCodes: verificationResult.data['error-codes']
        });
        throw new Error('人机验证失败，请重新验证');
      }

      logger.info('Turnstile 验证成功', {
        userId: userInfo?.userId,
        userRole,
        hostname: verificationResult.data.hostname
      });
    } catch (error) {
      if (error instanceof Error && error.message.includes('Turnstile')) {
        throw error;
      }
      logger.error('Turnstile 验证请求失败', {
        userId: userInfo?.userId,
        userRole,
        error: error instanceof Error ? error.message : String(error)
      });
      throw new Error('人机验证服务暂时不可用，请稍后重试');
    }
  } else if (!isAdmin && !process.env.TURNSTILE_SECRET_KEY) {
    logger.info('跳过 Turnstile 验证（未配置密钥）', {
      userId: userInfo?.userId,
      userRole
    });
  } else if (isAdmin) {
    logger.info('跳过 Turnstile 验证（管理员用户）', {
      userId: userInfo?.userId,
      userRole
    });
  }

  // 继续原有的CDK兑换逻辑...
}
```

### 2. CDK控制器 (`cdkController.ts`)

修改控制器以接收和传递Turnstile参数：

```typescript
export const redeemCDK = async (req: AuthRequest, res: Response) => {
  try {
    const { code, userId, username, forceRedeem, cfToken, userRole } = req.body;

    // 构建用户信息对象
    let userInfo: { userId: string; username: string } | undefined;
    if (userId && username) {
      userInfo = { userId, username };
    } else if (req.user) {
      userInfo = {
        userId: req.user.id || req.user._id || "unknown",
        username: req.user.username || req.user.name || "unknown",
      };
    }

    const result = await cdkService.redeemCDK(
      code,
      userInfo,
      forceRedeem,
      cfToken,
      userRole
    );

    logger.info("CDK兑换成功", {
      code,
      userInfo,
      resourceId: result.resource.id,
      forceRedeem,
    });

    res.json(result);
  } catch (error: any) {
    logger.error("CDK兑换失败:", error);

    // 处理重复资源的特殊情况
    if (error.message === "DUPLICATE_RESOURCE") {
      return res.status(409).json({
        message: "DUPLICATE_RESOURCE",
        resourceTitle: error.resourceTitle,
        resourceId: error.resourceId,
      });
    }

    // 处理 Turnstile 验证错误
    if (error instanceof Error) {
      if (
        error.message.includes("人机验证") ||
        error.message.includes("Turnstile")
      ) {
        return res.status(400).json({ message: error.message });
      }
    }

    res.status(400).json({ message: "兑换失败：无效或已使用的CDK" });
  }
};
```

## 前端实现

### 1. 状态管理

在 `ResourceStoreList.tsx` 中添加Turnstile相关状态：

```typescript
// Turnstile 相关状态
const { config: turnstileConfig, loading: turnstileConfigLoading } =
  useTurnstileConfig();
const [turnstileToken, setTurnstileToken] = useState<string>("");
const [turnstileVerified, setTurnstileVerified] = useState<boolean>(false);
const [turnstileError, setTurnstileError] = useState<string>("");
const [turnstileKey, setTurnstileKey] = useState<string>("");

// 检查是否为管理员
const isAdmin = useMemo(() => {
  const userRole = localStorage.getItem("userRole");
  return userRole === "admin" || userRole === "administrator";
}, []);
```

### 2. Turnstile回调函数

```typescript
// Turnstile 回调函数
const handleTurnstileVerify = (token: string) => {
  setTurnstileToken(token);
  setTurnstileVerified(true);
  setTurnstileError("");
  setTurnstileKey(token);
};

const handleTurnstileExpire = () => {
  setTurnstileToken("");
  setTurnstileVerified(false);
  setTurnstileError("");
  setTurnstileKey("");
};

const handleTurnstileError = () => {
  setTurnstileToken("");
  setTurnstileVerified(false);
  setTurnstileError("验证失败，请重试");
  setTurnstileKey("");
};
```

### 3. CDK兑换逻辑

修改兑换函数以包含Turnstile验证：

```typescript
const handleRedeemCDK = async (forceRedeem = false) => {
  const codeToRedeem = forceRedeem ? pendingCDKCode : cdkCode;

  if (!codeToRedeem.trim()) {
    setError("请输入CDK兑换码");
    return;
  }

  // 检查非管理员用户的 Turnstile 验证
  if (
    !isAdmin &&
    !!turnstileConfig.siteKey &&
    (!turnstileVerified || !turnstileToken)
  ) {
    setError("请先完成人机验证");
    return;
  }

  setCdkLoading(true);
  setError("");
  setSuccess("");

  try {
    // 生成用户信息
    const generateSecureId = () => {
      const array = new Uint32Array(2);
      crypto.getRandomValues(array);
      return array[0].toString(36) + array[1].toString(36);
    };

    const generateSecureNumber = () => {
      const array = new Uint32Array(1);
      crypto.getRandomValues(array);
      return array[0] % 10000;
    };

    const userInfo = {
      userId: `user_${Date.now()}_${generateSecureId()}`,
      username: `用户${generateSecureNumber()}`,
    };

    // 构建请求参数
    const requestParams: any = {
      code: codeToRedeem,
      ...userInfo,
      forceRedeem,
    };

    // 如果不是管理员且Turnstile已启用，添加验证token
    if (!isAdmin && !!turnstileConfig.siteKey && turnstileToken) {
      requestParams.cfToken = turnstileToken;
      requestParams.userRole = localStorage.getItem("userRole") || "user";
    }

    const result = await cdksApi.redeemCDK(requestParams);
    setSuccess(`兑换成功！获得资源：${result.resource.title}`);
    setCdkCode("");
    setPendingCDKCode("");
    setShowDuplicateDialog(false);

    // 重置 Turnstile 状态
    setTurnstileToken("");
    setTurnstileVerified(false);
    setTurnstileKey("");

    // 刷新已兑换资源列表和数量
    fetchRedeemedResourcesCount();
    if (activeTab === "owned") {
      fetchRedeemedResources();
    }

    // 显示下载链接
    if (result.resource.downloadUrl) {
      setTimeout(() => {
        window.open(result.resource.downloadUrl, "_blank");
      }, 1000);
    }
  } catch (error: any) {
    if (
      error.response?.status === 409 &&
      error.response?.data?.message === "DUPLICATE_RESOURCE"
    ) {
      setDuplicateResourceInfo({
        title: error.response.data.resourceTitle,
        id: error.response.data.resourceId,
      });
      setPendingCDKCode(codeToRedeem);
      setShowDuplicateDialog(true);
    } else {
      setError("兑换失败：CDK无效或已使用");
    }
  } finally {
    setCdkLoading(false);
  }
};
```

### 4. UI组件集成

在CDK兑换区域添加Turnstile组件：

```typescript
{/* Turnstile 验证组件（非管理员用户） */}
{!isAdmin && !turnstileConfigLoading && turnstileConfig.siteKey && typeof turnstileConfig.siteKey === 'string' && (
  <div className="mt-4">
    <div className="flex items-center gap-2 mb-2">
      <FaExclamationTriangle className="w-4 h-4 text-yellow-500" />
      <span className="text-sm text-gray-600">请完成人机验证</span>
    </div>
    <TurnstileWidget
      siteKey={turnstileConfig.siteKey}
      onVerify={handleTurnstileVerify}
      onExpire={handleTurnstileExpire}
      onError={handleTurnstileError}
      theme="light"
      size="normal"
    />
  </div>
)}
```

### 5. 按钮状态控制

兑换按钮根据Turnstile验证状态禁用：

```typescript
<motion.button
  onClick={() => handleRedeemCDK()}
  disabled={cdkLoading || (!isAdmin && !!turnstileConfig.siteKey && !turnstileVerified)}
  className="px-6 py-2 bg-gradient-to-r from-green-500 to-blue-600 text-white rounded-lg hover:from-green-600 hover:to-blue-700 disabled:opacity-50 transition-all duration-200 font-medium flex items-center justify-center gap-2"
  whileHover={!cdkLoading ? { scale: 1.02 } : {}}
  whileTap={!cdkLoading ? { scale: 0.98 } : {}}
>
  {cdkLoading ? (
    <>
      <FaSync className="animate-spin w-4 h-4" />
      兑换中...
    </>
  ) : (
    <>
      <FaKey className="w-4 h-4" />
      兑换
    </>
  )}
</motion.button>
```

## API接口更新

### 1. CDK兑换接口

更新API接口以支持Turnstile参数：

```typescript
// CDK兑换
redeemCDK: async (params: {
  code: string;
  userId?: string;
  username?: string;
  forceRedeem?: boolean;
  cfToken?: string;
  userRole?: string;
}) => {
  const response = await api.post(`${getApiBaseUrl()}/api/redeem`, params);
  return response.data;
},
```

## 安全考虑

### 1. 用户角色验证

- 严格区分管理员和普通用户
- 管理员用户跳过验证，提高操作效率
- 普通用户必须完成验证，防止自动化攻击

### 2. 错误处理

- 详细的错误日志记录
- 用户友好的错误提示
- 防止敏感信息泄露

### 3. 超时控制

- Turnstile验证请求设置10秒超时
- 避免长时间等待影响用户体验

### 4. 状态管理

- 验证成功后重置Turnstile状态
- 防止重复使用验证token
- 支持验证过期和错误回调

## 部署配置

### 1. 环境变量

确保后端配置了Turnstile密钥：

```bash
# .env 文件
TURNSTILE_SECRET_KEY=your_turnstile_secret_key_here
```

### 2. 前端配置

确保前端正确配置Turnstile：

```typescript
// 检查Turnstile配置
const { config: turnstileConfig, loading: turnstileConfigLoading } = useTurnstileConfig();

// 条件渲染Turnstile组件
{!isAdmin && !turnstileConfigLoading && turnstileConfig.siteKey && (
  <TurnstileWidget ... />
)}
```

## 测试用例

### 1. 管理员用户测试

```typescript
// 管理员用户兑换CDK（无需Turnstile验证）
const adminResult = await cdksApi.redeemCDK({
  code: "VALIDCDKCODE1234",
  userId: "admin_user",
  username: "Admin",
  userRole: "admin",
});

// 应该成功兑换，无需Turnstile验证
expect(adminResult.resource).toBeDefined();
```

### 2. 普通用户测试

```typescript
// 普通用户兑换CDK（需要Turnstile验证）
const userResult = await cdksApi.redeemCDK({
  code: "VALIDCDKCODE1234",
  userId: "normal_user",
  username: "User",
  userRole: "user",
  cfToken: "valid_turnstile_token",
});

// 应该成功兑换，包含Turnstile验证
expect(userResult.resource).toBeDefined();
```

### 3. 验证失败测试

```typescript
// 普通用户缺少Turnstile token
try {
  await cdksApi.redeemCDK({
    code: "VALIDCDKCODE1234",
    userId: "normal_user",
    username: "User",
    userRole: "user",
    // 缺少 cfToken
  });
} catch (error) {
  // 应该返回验证错误
  expect(error.response.data.message).toContain("需要完成人机验证");
}
```

## 监控和日志

### 1. 验证成功日志

```typescript
logger.info("Turnstile 验证成功", {
  userId: userInfo?.userId,
  userRole,
  hostname: verificationResult.data.hostname,
});
```

### 2. 验证失败日志

```typescript
logger.warn("Turnstile 验证失败", {
  userId: userInfo?.userId,
  userRole,
  errorCodes: verificationResult.data["error-codes"],
});
```

### 3. 网络错误日志

```typescript
logger.error("Turnstile 验证请求失败", {
  userId: userInfo?.userId,
  userRole,
  error: error instanceof Error ? error.message : String(error),
});
```

## 总结

通过为CDK兑换功能添加Turnstile验证，我们实现了：

1. **安全性提升**：防止自动化攻击和恶意兑换
2. **用户体验优化**：管理员用户跳过验证，普通用户友好的验证流程
3. **错误处理完善**：详细的错误日志和用户友好的提示
4. **状态管理**：完整的验证状态管理和重置逻辑
5. **配置灵活性**：支持环境变量配置和条件渲染

这个实现确保了CDK兑换功能的安全性和可用性，为用户提供了良好的使用体验。
