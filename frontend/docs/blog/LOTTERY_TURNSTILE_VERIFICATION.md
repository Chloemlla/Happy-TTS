---
title: 抽奖系统Turnstile验证实现
date: 2025-08-27
slug: lottery-turnstile-verification
tags: [lottery, turnstile, verification, security, backend, frontend, blog]
---

# 抽奖系统Turnstile验证实现

## 概述

为了保护抽奖系统免受自动化攻击和恶意参与，我们为抽奖参与功能添加了Cloudflare Turnstile人机验证。非管理员用户在参与抽奖时必须完成Turnstile验证，而管理员用户则跳过验证。

## 功能特性

### 1. 用户角色区分

- **管理员用户**：跳过Turnstile验证，直接参与抽奖
- **普通用户**：必须完成Turnstile验证才能参与抽奖

### 2. 验证流程

1. 用户点击"立即参与"按钮
2. 非管理员用户完成Turnstile验证
3. 前端发送包含验证token的请求
4. 后端验证Turnstile token
5. 验证成功后进行抽奖

### 3. 错误处理

- Turnstile验证失败时返回具体错误信息
- 网络错误时提供友好的错误提示
- 支持验证过期和错误回调

## 后端实现

### 1. 抽奖服务层 (`lotteryService.ts`)

扩展 `participateInLottery` 方法，添加Turnstile验证：

```typescript
public async participateInLottery(
  roundId: string,
  userId: string,
  username: string,
  cfToken?: string,
  userRole?: string
): Promise<LotteryWinner | null> {
  // ... 现有验证逻辑 ...

  // Turnstile 验证（非管理员用户）
  const isAdmin = userRole === 'admin' || userRole === 'administrator';
  if (!isAdmin && process.env.TURNSTILE_SECRET_KEY) {
    if (!cfToken) {
      logger.warn('非管理员用户缺少 Turnstile token，拒绝参与抽奖', { userId, userRole });
      throw new Error('需要完成人机验证才能参与抽奖');
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
          userId,
          userRole,
          errorCodes: verificationResult.data['error-codes']
        });
        throw new Error('人机验证失败，请重新验证');
      }

      logger.info('Turnstile 验证成功', {
        userId,
        userRole,
        hostname: verificationResult.data.hostname
      });
    } catch (error) {
      if (error instanceof Error && error.message.includes('Turnstile')) {
        throw error;
      }
      logger.error('Turnstile 验证请求失败', {
        userId,
        userRole,
        error: error instanceof Error ? error.message : String(error)
      });
      throw new Error('人机验证服务暂时不可用，请稍后重试');
    }
  } else if (!isAdmin && !process.env.TURNSTILE_SECRET_KEY) {
    logger.info('跳过 Turnstile 验证（未配置密钥）', { userId, userRole });
  } else if (isAdmin) {
    logger.info('跳过 Turnstile 验证（管理员用户）', { userId, userRole });
  }

  // 继续原有的抽奖逻辑...
}
```

### 2. 抽奖控制器 (`lotteryController.ts`)

修改控制器以接收和传递Turnstile参数：

```typescript
public async participateInLottery(req: Request, res: Response): Promise<void> {
  try {
    const { roundId } = req.params;
    const { cfToken, userRole } = req.body;
    const userId = req.user?.id;
    const username = req.user?.username;

    if (!userId || !username) {
      res.status(401).json({
        success: false,
        error: '用户未登录'
      });
      return;
    }

    // WAF校验
    if (!wafCheck(roundId, 64) || !wafCheck(username, 64)) {
      res.status(400).json({ success: false, error: '参数非法' });
      return;
    }

    const winner = await lotteryService.participateInLottery(
      roundId,
      userId,
      username,
      cfToken,
      userRole
    );

    res.json({
      success: true,
      data: winner
    });
  } catch (error) {
    logger.error('参与抽奖失败:', error);

    // 处理 Turnstile 验证错误
    if (error instanceof Error) {
      if (error.message.includes('人机验证') || error.message.includes('Turnstile')) {
        res.status(400).json({
          success: false,
          error: error.message
        });
        return;
      }
    }

    res.status(400).json({
      success: false,
      error: error instanceof Error ? error.message : '参与抽奖失败'
    });
  }
}
```

## 前端实现

### 1. 状态管理

在 `LotteryPage.tsx` 中添加Turnstile相关状态：

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

### 3. 抽奖参与逻辑

修改参与函数以包含Turnstile验证：

```typescript
const handleParticipate = async (roundId: string, cfToken?: string) => {
  try {
    // 检查非管理员用户的 Turnstile 验证
    if (
      !isAdmin &&
      !!turnstileConfig.siteKey &&
      (!turnstileVerified || !turnstileToken)
    ) {
      setNotification({ message: "请先完成人机验证", type: "error" });
      return;
    }

    const result = await participateInLottery(roundId, cfToken);
    setWinner(result);
    setNotification({
      message: `恭喜获得 ${result.prizeName}！`,
      type: "success",
    });

    // 重置 Turnstile 状态
    setTurnstileToken("");
    setTurnstileVerified(false);
    setTurnstileKey("");
  } catch (err) {
    const msg = err instanceof Error ? err.message : "参与抽奖失败";
    setNotification({ message: msg, type: "error" });
  }
};
```

### 4. 抽奖轮次卡片组件

修改 `LotteryRoundCard` 组件以支持Turnstile验证：

```typescript
const LotteryRoundCard: React.FC<{
  round: LotteryRound;
  onParticipate: (roundId: string, cfToken?: string) => void;
  loading: boolean;
  turnstileVerified?: boolean;
  turnstileToken?: string;
  isAdmin?: boolean;
  turnstileConfig?: any;
  turnstileConfigLoading?: boolean;
  onTurnstileVerify?: (token: string) => void;
  onTurnstileExpire?: () => void;
  onTurnstileError?: () => void;
}> = ({
  round,
  onParticipate,
  loading,
  turnstileVerified = false,
  turnstileToken = '',
  isAdmin = false,
  turnstileConfig,
  turnstileConfigLoading = false,
  onTurnstileVerify,
  onTurnstileExpire,
  onTurnstileError
}) => {
  // ... 组件逻辑 ...

  return (
    <motion.div>
      {/* ... 其他内容 ... */}

      {user && (
        <div className="flex flex-col gap-2">
          <motion.button
            onClick={() => onParticipate(round.id, turnstileToken)}
            disabled={!isActive || hasParticipated || loading || (!isAdmin && !!turnstileConfig?.siteKey && !turnstileVerified)}
            className={`px-6 py-2 rounded-lg font-medium transition-colors ${
              !isActive || hasParticipated || loading || (!isAdmin && !!turnstileConfig?.siteKey && !turnstileVerified)
                ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                : 'bg-blue-500 text-white hover:bg-blue-600'
            }`}
            whileTap={{ scale: 0.95 }}
          >
            {loading ? '抽奖中...' : hasParticipated ? '已参与' : '立即参与'}
          </motion.button>

          {/* Turnstile 验证组件（非管理员用户） */}
          {!isAdmin && !turnstileConfigLoading && turnstileConfig?.siteKey && typeof turnstileConfig.siteKey === 'string' && (
            <div className="mt-2">
              <div className="flex items-center gap-2 mb-2">
                {turnstileVerified ? (
                  <>
                    <FaCheckCircle className="w-4 h-4 text-green-500" />
                    <span className="text-sm text-green-600 font-medium">已完成</span>
                  </>
                ) : (
                  <>
                    <FaExclamationTriangle className="w-4 h-4 text-yellow-500" />
                    <span className="text-sm text-gray-600">请完成人机验证</span>
                  </>
                )}
              </div>
              <TurnstileWidget
                siteKey={turnstileConfig.siteKey}
                onVerify={onTurnstileVerify || (() => {})}
                onExpire={onTurnstileExpire || (() => {})}
                onError={onTurnstileError || (() => {})}
                theme="light"
                size="normal"
              />
            </div>
          )}
        </div>
      )}
    </motion.div>
  );
};
```

### 5. API接口更新

修改 `lotteryApi.ts` 以支持Turnstile参数：

```typescript
// 参与抽奖
export async function participateInLottery(
  roundId: string,
  cfToken?: string
): Promise<LotteryWinner> {
  const body: any = {};

  // 如果不是管理员且提供了cfToken，添加到请求体
  const userRole = localStorage.getItem("userRole");
  const isAdmin = userRole === "admin" || userRole === "administrator";

  if (!isAdmin && cfToken) {
    body.cfToken = cfToken;
    body.userRole = userRole || "user";
  }

  return apiRequest<LotteryWinner>(`/rounds/${roundId}/participate`, {
    method: "POST",
    body: Object.keys(body).length > 0 ? JSON.stringify(body) : undefined,
  });
}
```

### 6. Hook更新

修改 `useLottery.ts` 以支持Turnstile参数：

```typescript
// 参与抽奖
const participateInLottery = useCallback(
  async (roundId: string, cfToken?: string): Promise<LotteryWinner> => {
    if (!user) {
      throw new Error("请先登录");
    }

    setLoading(true);
    setError(null);

    try {
      const winner = await lotteryApi.participateInLottery(roundId, cfToken);

      // 更新相关数据
      await Promise.all([
        fetchActiveRounds(),
        fetchUserRecord(),
        fetchLeaderboard(),
        fetchStatistics(),
      ]);

      return winner;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "参与抽奖失败";
      setError(errorMessage);
      throw err;
    } finally {
      setLoading(false);
    }
  },
  [user, fetchActiveRounds, fetchUserRecord, fetchLeaderboard, fetchStatistics]
);
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
{!isAdmin && !turnstileConfigLoading && turnstileConfig?.siteKey && (
  <TurnstileWidget ... />
)}
```

## 测试用例

### 1. 管理员用户测试

```typescript
// 管理员用户参与抽奖（无需Turnstile验证）
const adminResult = await lotteryApi.participateInLottery("round_id");
// 应该成功参与，无需Turnstile验证
expect(adminResult.prizeName).toBeDefined();
```

### 2. 普通用户测试

```typescript
// 普通用户参与抽奖（需要Turnstile验证）
const userResult = await lotteryApi.participateInLottery(
  "round_id",
  "valid_turnstile_token"
);
// 应该成功参与，包含Turnstile验证
expect(userResult.prizeName).toBeDefined();
```

### 3. 验证失败测试

```typescript
// 普通用户缺少Turnstile token
try {
  await lotteryApi.participateInLottery("round_id");
} catch (error) {
  // 应该返回验证错误
  expect(error.message).toContain("需要完成人机验证");
}
```

## 监控和日志

### 1. 验证成功日志

```typescript
logger.info("Turnstile 验证成功", {
  userId,
  userRole,
  hostname: verificationResult.data.hostname,
});
```

### 2. 验证失败日志

```typescript
logger.warn("Turnstile 验证失败", {
  userId,
  userRole,
  errorCodes: verificationResult.data["error-codes"],
});
```

### 3. 网络错误日志

```typescript
logger.error("Turnstile 验证请求失败", {
  userId,
  userRole,
  error: error instanceof Error ? error.message : String(error),
});
```

## 总结

通过为抽奖系统添加Turnstile验证，我们实现了：

1. **安全性提升**：防止自动化攻击和恶意参与抽奖
2. **用户体验优化**：管理员用户跳过验证，普通用户友好的验证流程
3. **错误处理完善**：详细的错误日志和用户友好的提示
4. **状态管理**：完整的验证状态管理和重置逻辑
5. **配置灵活性**：支持环境变量配置和条件渲染

这个实现确保了抽奖系统的安全性和可用性，为用户提供了良好的使用体验，同时保护了系统的公平性。
