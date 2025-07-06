---
title: 验证方式选择弹窗
date: 2025-06-20
slug: VERIFICATION_METHOD_SELECTOR
---

# 验证方式选择弹窗

## 功能概述

当用户同时启用 Passkey 和 TOTP 两种二次验证方式时，系统会显示一个精美的弹窗，让用户选择使用哪种验证方式进行登录。

## 特性

### 🎨 精美设计

- 使用 Framer Motion 实现流畅的动画效果
- 渐变背景和现代化的 UI 设计
- 响应式布局，适配各种屏幕尺寸
- 悬停和点击动画效果

### 🔄 流畅动画

- 弹窗出现/消失的淡入淡出效果
- 卡片悬停时的上浮和缩放效果
- 图标旋转和缩放动画
- 加载状态的旋转动画

### 🎯 用户体验

- 清晰的视觉层次和引导
- 直观的图标和文字说明
- 安全提示信息
- 加载状态反馈

## 组件结构

### VerificationMethodSelector

主要的验证方式选择弹窗组件

```typescript
interface VerificationMethodSelectorProps {
  isOpen: boolean; // 控制弹窗显示/隐藏
  onClose: () => void; // 关闭弹窗的回调
  onSelectMethod: (method: "passkey" | "totp") => void; // 选择验证方式的回调
  username: string; // 用户名
  loading?: boolean; // 加载状态
}
```

### 动画配置

- **容器动画**: 淡入淡出效果
- **模态框动画**: 弹簧动画，从缩放 0.8 到 1.0
- **卡片动画**: 悬停时上浮和缩放
- **图标动画**: 旋转和缩放效果

## 使用方法

### 1. 在 AuthForm 中集成

```typescript
import VerificationMethodSelector from "./VerificationMethodSelector";

// 在组件中添加状态
const [showVerificationSelector, setShowVerificationSelector] = useState(false);
const [pendingVerificationData, setPendingVerificationData] =
  useState<any>(null);

// 处理验证方式选择
const handleVerificationMethodSelect = async (method: "passkey" | "totp") => {
  setShowVerificationSelector(false);
  setLoading(true);

  try {
    if (method === "passkey") {
      // 处理Passkey验证
      const success = await authenticateWithPasskey(username);
      if (success) {
        window.location.reload();
      }
    } else if (method === "totp") {
      // 处理TOTP验证
      setShowTOTPVerification(true);
    }
  } catch (error) {
    setError(error.message);
  } finally {
    setLoading(false);
  }
};

// 在JSX中渲染
{
  showVerificationSelector && pendingVerificationData && (
    <VerificationMethodSelector
      isOpen={showVerificationSelector}
      onClose={() => setShowVerificationSelector(false)}
      onSelectMethod={handleVerificationMethodSelect}
      username={pendingVerificationData.username}
      loading={loading}
    />
  );
}
```

### 2. 登录流程集成

在登录成功后检查用户的二次验证设置：

```typescript
const result = await login(username, password);
if (result && result.requires2FA && result.twoFactorType) {
  const verificationTypes = result.twoFactorType;
  const hasPasskey = verificationTypes.includes("Passkey");
  const hasTOTP = verificationTypes.includes("TOTP");

  if (hasPasskey && hasTOTP) {
    // 同时启用两种验证方式，显示选择弹窗
    setPendingVerificationData({
      user: result.user,
      userId: result.user.id,
      token: result.token,
      username: username,
    });
    setShowVerificationSelector(true);
  } else if (hasPasskey) {
    // 只启用Passkey
    setShowPasskeyVerification(true);
  } else if (hasTOTP) {
    // 只启用TOTP
    setShowTOTPVerification(true);
  }
}
```

## 动画效果详解

### 1. 弹窗出现动画

```typescript
const modalVariants = {
  hidden: {
    opacity: 0,
    scale: 0.8,
    y: 50,
  },
  visible: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: {
      type: "spring",
      damping: 25,
      stiffness: 300,
    },
  },
};
```

### 2. 卡片悬停动画

```typescript
const cardVariants = {
  hover: {
    y: -5,
    scale: 1.02,
    transition: {
      type: "spring",
      damping: 15,
      stiffness: 400,
    },
  },
  tap: {
    scale: 0.98,
  },
};
```

### 3. 图标动画

```typescript
const iconVariants = {
  visible: {
    rotate: 0,
    scale: 1,
    transition: {
      type: "spring",
      damping: 15,
      stiffness: 300,
      delay: 0.2,
    },
  },
};
```

## 样式设计

### 颜色方案

- **主色调**: 靛蓝色到紫色的渐变
- **Passkey**: 靛蓝色到紫色渐变
- **TOTP**: 绿色到翠绿色渐变
- **背景**: 白色到浅灰色的渐变

### 布局设计

- **圆角**: 使用大圆角(rounded-2xl)营造现代感
- **阴影**: 多层阴影效果增加层次感
- **间距**: 统一的内边距和外边距
- **字体**: 清晰的字体层次和权重

## 测试

### 测试组件

创建了`TestVerificationSelector`组件用于测试弹窗效果：

```typescript
import TestVerificationSelector from "./TestVerificationSelector";

// 在路由中添加测试页面
<Route path="/test-verification" element={<TestVerificationSelector />} />;
```

### 测试功能

- 弹窗显示/隐藏
- 验证方式选择
- 加载状态
- 动画效果
- 响应式布局

## 依赖项

- **framer-motion**: 动画库
- **@radix-ui/react-dialog**: 对话框组件
- **tailwindcss**: 样式框架

## 浏览器兼容性

- Chrome 60+
- Firefox 55+
- Safari 12+
- Edge 79+

## 性能优化

- 使用`AnimatePresence`管理动画生命周期
- 延迟加载非关键动画
- 优化动画性能，避免重绘
- 使用 CSS transform 进行动画

## 未来改进

1. **主题支持**: 支持深色模式
2. **国际化**: 支持多语言
3. **无障碍**: 改进键盘导航和屏幕阅读器支持
4. **自定义**: 允许自定义动画参数和样式
