---
title: 首次访问检测系统实现
description: 基于浏览器指纹的首次访问检测和人机验证系统
date: 2025-09-15
author: Synapse Team
tags: [前端, 后端, 安全, 指纹检测, Turnstile]
---

# 首次访问检测系统实现

## 概述

本系统实现了基于浏览器指纹的首次访问检测功能，当用户第一次访问网站时，会显示一个包含网站Logo和人机验证的页面，验证通过后才能正常访问网站内容。

## 核心功能

### 1. 浏览器指纹生成

- 使用FingerprintJS库生成稳定的浏览器指纹
- 包含Canvas、WebGL、屏幕信息、时区等多种特征
- 支持本地缓存，避免重复生成

### 2. 临时指纹存储

- 后端使用内存存储临时指纹信息
- 有效期为5分钟，自动清理过期数据
- 支持指纹验证状态管理

### 3. 首次访问检测

- 前端自动检测是否为首次访问
- 后端验证指纹是否已存在
- 支持验证状态持久化

### 4. 人机验证集成

- 集成Cloudflare Turnstile组件
- 验证通过后标记指纹为已验证
- 支持验证失败重试

## 技术实现

### 后端API接口

#### 1. 临时指纹上报接口

```typescript
// POST /api/turnstile/temp-fingerprint
router.post("/temp-fingerprint", async (req, res) => {
  try {
    const { fingerprint } = req.body;

    if (!fingerprint || typeof fingerprint !== "string") {
      return res.status(400).json({
        success: false,
        error: "指纹参数无效",
      });
    }

    const now = Date.now();
    const isFirstVisit = !tempFingerprints.has(fingerprint);

    if (isFirstVisit) {
      // 首次访问，记录指纹
      tempFingerprints.set(fingerprint, {
        timestamp: now,
        verified: false,
      });
    }

    res.json({
      success: true,
      isFirstVisit,
      verified: tempFingerprints.get(fingerprint)?.verified || false,
    });
  } catch (error) {
    console.error("临时指纹上报失败:", error);
    res.status(500).json({
      success: false,
      error: "服务器内部错误",
    });
  }
});
```

#### 2. 指纹验证接口

```typescript
// POST /api/turnstile/verify-temp-fingerprint
router.post("/verify-temp-fingerprint", async (req, res) => {
  try {
    const { fingerprint, cfToken } = req.body;

    if (!fingerprint || typeof fingerprint !== "string") {
      return res.status(400).json({
        success: false,
        error: "指纹参数无效",
      });
    }

    if (!cfToken || typeof cfToken !== "string") {
      return res.status(400).json({
        success: false,
        error: "验证令牌无效",
      });
    }

    const fingerprintData = tempFingerprints.get(fingerprint);
    if (!fingerprintData) {
      return res.status(400).json({
        success: false,
        error: "指纹不存在或已过期",
      });
    }

    // 验证Turnstile令牌
    const isValid = await TurnstileService.verifyToken(cfToken, req.ip);
    if (!isValid) {
      return res.status(400).json({
        success: false,
        error: "人机验证失败",
      });
    }

    // 标记为已验证
    fingerprintData.verified = true;
    tempFingerprints.set(fingerprint, fingerprintData);

    res.json({
      success: true,
      verified: true,
    });
  } catch (error) {
    console.error("验证临时指纹失败:", error);
    res.status(500).json({
      success: false,
      error: "服务器内部错误",
    });
  }
});
```

#### 3. 指纹状态检查接口

```typescript
// GET /api/turnstile/temp-fingerprint/:fingerprint
router.get("/temp-fingerprint/:fingerprint", async (req, res) => {
  try {
    const { fingerprint } = req.params;

    if (!fingerprint) {
      return res.status(400).json({
        success: false,
        error: "指纹参数无效",
      });
    }

    const fingerprintData = tempFingerprints.get(fingerprint);
    if (!fingerprintData) {
      return res.json({
        success: true,
        exists: false,
        verified: false,
      });
    }

    res.json({
      success: true,
      exists: true,
      verified: fingerprintData.verified,
    });
  } catch (error) {
    console.error("检查临时指纹状态失败:", error);
    res.status(500).json({
      success: false,
      error: "服务器内部错误",
    });
  }
});
```

### 前端实现

#### 1. 指纹工具函数

```typescript
// frontend/src/utils/fingerprint.ts

// 临时指纹上报（用于首次访问检测）
export const reportTempFingerprint = async (): Promise<{
  isFirstVisit: boolean;
  verified: boolean;
}> => {
  try {
    const fingerprint = await getFingerprint();
    if (!fingerprint) {
      throw new Error("无法生成指纹");
    }

    const response = await fetch(
      `${getApiBaseUrl()}/api/turnstile/temp-fingerprint`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ fingerprint }),
      }
    );

    if (!response.ok) {
      throw new Error("指纹上报失败");
    }

    const data = await response.json();
    return {
      isFirstVisit: data.isFirstVisit || false,
      verified: data.verified || false,
    };
  } catch (error) {
    console.error("临时指纹上报失败:", error);
    // 出错时默认不是首次访问，避免阻塞用户
    return { isFirstVisit: false, verified: false };
  }
};

// 验证临时指纹
export const verifyTempFingerprint = async (
  fingerprint: string,
  cfToken: string
): Promise<boolean> => {
  try {
    const response = await fetch(
      `${getApiBaseUrl()}/api/turnstile/verify-temp-fingerprint`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ fingerprint, cfToken }),
      }
    );

    if (!response.ok) {
      throw new Error("验证失败");
    }

    const data = await response.json();
    return data.success && data.verified;
  } catch (error) {
    console.error("验证临时指纹失败:", error);
    return false;
  }
};

// 检查临时指纹状态
export const checkTempFingerprintStatus = async (
  fingerprint: string
): Promise<{ exists: boolean; verified: boolean }> => {
  try {
    const response = await fetch(
      `${getApiBaseUrl()}/api/turnstile/temp-fingerprint/${fingerprint}`
    );

    if (!response.ok) {
      throw new Error("检查状态失败");
    }

    const data = await response.json();
    return {
      exists: data.exists || false,
      verified: data.verified || false,
    };
  } catch (error) {
    console.error("检查临时指纹状态失败:", error);
    return { exists: false, verified: false };
  }
};
```

#### 2. 首次访问检测Hook

```typescript
// frontend/src/hooks/useFirstVisitDetection.ts

export const useFirstVisitDetection = (): UseFirstVisitDetectionReturn => {
  const [isFirstVisit, setIsFirstVisit] = useState(false);
  const [isVerified, setIsVerified] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fingerprint, setFingerprint] = useState<string | null>(null);

  const checkFirstVisit = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      // 生成指纹
      const fp = await getFingerprint();
      if (!fp) {
        throw new Error("无法生成浏览器指纹");
      }
      setFingerprint(fp);

      // 检查是否已经验证过
      const status = await checkTempFingerprintStatus(fp);
      if (status.exists && status.verified) {
        setIsFirstVisit(false);
        setIsVerified(true);
        return;
      }

      // 上报指纹并检查是否首次访问
      const result = await reportTempFingerprint();
      setIsFirstVisit(result.isFirstVisit);
      setIsVerified(result.verified);
    } catch (err) {
      console.error("首次访问检测失败:", err);
      setError(err instanceof Error ? err.message : "检测失败");
      // 出错时默认不是首次访问，避免阻塞用户
      setIsFirstVisit(false);
      setIsVerified(false);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const markAsVerified = useCallback(() => {
    setIsVerified(true);
    setIsFirstVisit(false);
  }, []);

  useEffect(() => {
    checkFirstVisit();
  }, [checkFirstVisit]);

  return {
    isFirstVisit,
    isVerified,
    isLoading,
    error,
    fingerprint,
    checkFirstVisit,
    markAsVerified,
  };
};
```

#### 3. 首次访问验证组件

```typescript
// frontend/src/components/FirstVisitVerification.tsx

export const FirstVisitVerification: React.FC<FirstVisitVerificationProps> = ({
  onVerificationComplete,
  fingerprint,
}) => {
  const { config: turnstileConfig, loading: turnstileConfigLoading } = useTurnstileConfig();
  const [turnstileToken, setTurnstileToken] = useState<string>('');
  const [turnstileVerified, setTurnstileVerified] = useState(false);
  const [turnstileError, setTurnstileError] = useState(false);
  const [turnstileKey, setTurnstileKey] = useState(0);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState<string>('');

  const handleTurnstileVerify = useCallback((token: string) => {
    console.log('Turnstile验证成功，token:', token);
    setTurnstileToken(token);
    setTurnstileVerified(true);
    setTurnstileError(false);
    setError('');
  }, []);

  const handleVerify = useCallback(async () => {
    if (!turnstileVerified || !turnstileToken) {
      setError('请先完成人机验证');
      return;
    }

    setVerifying(true);
    setError('');

    try {
      const success = await verifyTempFingerprint(fingerprint, turnstileToken);
      if (success) {
        console.log('首次访问验证成功');
        onVerificationComplete();
      } else {
        setError('验证失败，请重试');
        setTurnstileToken('');
        setTurnstileVerified(false);
        setTurnstileKey(k => k + 1);
      }
    } catch (err) {
      console.error('验证失败:', err);
      setError('验证失败，请重试');
      setTurnstileToken('');
      setTurnstileVerified(false);
      setTurnstileKey(k => k + 1);
    } finally {
      setVerifying(false);
    }
  }, [turnstileVerified, turnstileToken, fingerprint, onVerificationComplete]);

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.9 }}
        transition={{ duration: 0.3 }}
        className="fixed inset-0 bg-gradient-to-br from-indigo-50 via-white to-purple-50 flex items-center justify-center p-4 z-50"
      >
        <motion.div
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.1, duration: 0.3 }}
          className="bg-white rounded-2xl shadow-2xl p-8 max-w-md w-full mx-4"
        >
          {/* Logo */}
          <Logo />

          {/* 标题 */}
          <h1 className="text-2xl font-bold text-center text-gray-800 mb-2">
            欢迎访问
          </h1>

          {/* 说明文字 */}
          <p className="text-center text-gray-600 mb-8 leading-relaxed">
            需要验证您是否是人机
            <br />
            请完成下方验证以继续访问
          </p>

          {/* Turnstile组件 */}
          {!turnstileConfigLoading && turnstileConfig.siteKey && typeof turnstileConfig.siteKey === 'string' && (
            <div className="mb-6">
              <div className="flex justify-center mb-4">
                <TurnstileWidget
                  key={turnstileKey}
                  siteKey={turnstileConfig.siteKey}
                  onVerify={handleTurnstileVerify}
                  onExpire={handleTurnstileExpire}
                  onError={handleTurnstileError}
                  theme="light"
                  size="normal"
                />
              </div>

              {/* 验证状态 */}
              <div className="text-center mb-4">
                {turnstileVerified ? (
                  <div className="flex items-center justify-center gap-2 text-green-600">
                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                    <span className="font-medium">验证通过</span>
                  </div>
                ) : (
                  <div className="flex items-center justify-center gap-2 text-gray-500">
                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                    </svg>
                    <span>请完成验证</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* 错误信息 */}
          {error && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg"
            >
              <div className="flex items-center gap-2 text-red-600">
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
                <span className="text-sm">{error}</span>
              </div>
            </motion.div>
          )}

          {/* 验证按钮 */}
          <motion.button
            onClick={handleVerify}
            disabled={!turnstileVerified || verifying}
            className="w-full py-3 px-6 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            {verifying ? (
              <div className="flex items-center justify-center gap-2">
                <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                验证中...
              </div>
            ) : (
              '继续访问'
            )}
          </motion.button>

          {/* 底部说明 */}
          <div className="mt-6 text-center">
            <p className="text-xs text-gray-500">
              此验证仅用于防止自动化访问
              <br />
              您的隐私将得到保护
            </p>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};
```

#### 4. 主应用集成

```typescript
// frontend/src/App.tsx

const App: React.FC = () => {
  // ... 其他状态

  // 首次访问检测
  const {
    isFirstVisit,
    isVerified,
    isLoading: isFirstVisitLoading,
    error: firstVisitError,
    fingerprint,
    markAsVerified,
  } = useFirstVisitDetection();

  // 首次访问验证
  if (isFirstVisitLoading) {
    return (
      <NotificationProvider>
        <LazyMotion features={domAnimation}>
          <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-purple-50 flex items-center justify-center">
            <LoadingSpinner />
          </div>
        </LazyMotion>
      </NotificationProvider>
    );
  }

  // 首次访问且未验证，显示验证页面
  if (isFirstVisit && !isVerified && fingerprint) {
    return (
      <NotificationProvider>
        <LazyMotion features={domAnimation}>
          <FirstVisitVerification
            fingerprint={fingerprint}
            onVerificationComplete={markAsVerified}
          />
        </LazyMotion>
      </NotificationProvider>
    );
  }

  // 正常应用内容
  return (
    <NotificationProvider>
      <LazyMotion features={domAnimation}>
        {/* 应用内容 */}
      </LazyMotion>
    </NotificationProvider>
  );
};
```

## 工作流程

### 1. 用户首次访问

1. 前端生成浏览器指纹
2. 上报指纹到后端
3. 后端检查是否为首次访问
4. 如果是首次访问，显示验证页面

### 2. 人机验证流程

1. 用户完成Turnstile验证
2. 前端获取验证令牌
3. 发送指纹和令牌到后端验证
4. 后端验证Turnstile令牌
5. 验证通过后标记指纹为已验证

### 3. 后续访问

1. 前端检查指纹状态
2. 如果已验证，直接进入应用
3. 如果未验证，重新显示验证页面

## 安全特性

### 1. 指纹唯一性

- 使用多种浏览器特征生成唯一指纹
- 支持Canvas、WebGL、屏幕信息等
- 本地缓存避免重复生成

### 2. 临时存储

- 后端使用内存存储，5分钟自动过期
- 避免长期存储用户指纹信息
- 定期清理过期数据

### 3. 人机验证

- 集成Cloudflare Turnstile
- 防止自动化访问
- 支持验证失败重试

### 4. 错误处理

- 网络错误时默认允许访问
- 避免因系统故障阻塞用户
- 详细的错误日志记录

## 性能优化

### 1. 懒加载

- 指纹生成使用缓存机制
- 避免重复的指纹计算
- 异步处理避免阻塞UI

### 2. 状态管理

- 使用React Hook管理状态
- 避免不必要的重新渲染
- 优化组件生命周期

### 3. 用户体验

- 加载状态显示
- 平滑的动画过渡
- 友好的错误提示

## 配置说明

### 1. 后端配置

- 临时指纹存储时间：5分钟
- 清理间隔：5分钟
- 支持自定义配置

### 2. 前端配置

- Turnstile站点密钥配置
- 指纹生成策略
- 错误处理策略

### 3. 环境变量

```bash
# Turnstile配置
TURNSTILE_SITE_KEY=your_site_key
TURNSTILE_SECRET_KEY=your_secret_key

# API基础URL
VITE_API_BASE_URL=http://localhost:3001
```

## 测试验证

### 1. 首次访问测试

1. 清除浏览器缓存和本地存储
2. 访问网站
3. 验证是否显示验证页面
4. 完成人机验证
5. 验证是否正常进入应用

### 2. 后续访问测试

1. 刷新页面
2. 验证是否直接进入应用
3. 检查是否不再显示验证页面

### 3. 错误处理测试

1. 模拟网络错误
2. 验证是否默认允许访问
3. 检查错误日志记录

## 总结

首次访问检测系统成功实现了基于浏览器指纹的访问控制，通过人机验证确保用户真实性，同时保证了良好的用户体验和系统安全性。系统具有良好的扩展性和可维护性，可以根据需要进一步优化和扩展功能。
