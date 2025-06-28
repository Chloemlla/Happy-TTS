---
title: TOTP 二维码格式说明
date: 2025-06-28
slug: totp-qrcode-format
---

# TOTP 二维码格式说明

## 概述

本文档详细说明了 TOTP（基于时间的一次性密码）二维码传递给 Authenticator 应用的内容格式和必要参数。

## otpauth URL 格式

TOTP 二维码包含一个标准的 `otpauth://` URL，格式如下：

```
otpauth://totp/issuer:accountname?secret=SECRET&issuer=ISSUER&algorithm=SHA1&digits=6&period=30
```

### URL 组成部分

1. **协议**: `otpauth://`
2. **类型**: `totp` (基于时间的一次性密码)
3. **标签**: `issuer:accountname` (发行者:账户名)
4. **参数**: 查询字符串包含所有必要配置

### 必要参数

| 参数        | 值                | 说明                                    |
| ----------- | ----------------- | --------------------------------------- |
| `secret`    | Base32 编码字符串 | TOTP 密钥，用于生成验证码               |
| `issuer`    | 服务名称          | 发行者名称，显示在 Authenticator 应用中 |
| `algorithm` | SHA1              | 哈希算法，标准 TOTP 使用 SHA1           |
| `digits`    | 6                 | 验证码位数，标准为 6 位                 |
| `period`    | 30                | 时间窗口，单位为秒                      |

## 当前实现

### 后端生成

在 `src/services/totpService.ts` 中：

```typescript
const otpauthUrl = speakeasy.otpauthURL({
  secret, // TOTP密钥
  label: safeUsername, // 账户名（用户名）
  issuer: safeServiceName, // 发行者（服务名）
  algorithm: "sha1", // 哈希算法
  digits: 6, // 验证码位数
  period: 30, // 时间窗口
});
```

### 安全处理

1. **用户名清理**: 移除特殊字符，避免 URL 编码问题
2. **服务名清理**: 确保服务名符合 URL 规范
3. **密钥安全**: 使用 32 字符的 Base32 编码密钥

### 示例 URL

```
otpauth://totp/Synapse:testuser?secret=JBSWY3DPEHPK3PXP&issuer=Synapse&algorithm=sha1&digits=6&period=30
```

## 二维码优化

### 后端优化

- **尺寸**: 256x256 像素，提高扫描清晰度
- **错误纠正**: M 级别，平衡大小和容错性
- **边距**: 1 像素，减少空白区域
- **颜色**: 黑色前景，白色背景，确保对比度

### 前端优化

- **响应式尺寸**: 根据屏幕宽度自适应
- **清晰度**: 使用 SVG 格式，确保矢量清晰
- **用户指导**: 提供扫描说明和推荐应用

## Authenticator 应用兼容性

### 支持的应用

- ✅ Google Authenticator
- ✅ Microsoft Authenticator
- ✅ Authy
- ✅ 1Password
- ✅ LastPass Authenticator
- ✅ FreeOTP
- ✅ TOTP Authenticator

### 兼容性检查

所有主流 Authenticator 应用都支持标准 TOTP 格式：

1. **otpauth://** 协议
2. **totp** 类型
3. **Base32** 编码的密钥
4. **SHA1** 算法
5. **6 位** 验证码
6. **30 秒** 时间窗口

## 测试验证

### URL 格式验证

使用正则表达式验证 URL 格式：

```typescript
const urlPattern =
  /^otpauth:\/\/totp\/([^:]+):([^?]+)\?secret=([^&]+)&issuer=([^&]+)&algorithm=([^&]+)&digits=(\d+)&period=(\d+)$/;
```

### 参数完整性检查

确保包含所有必要参数：

- `secret` - TOTP 密钥
- `issuer` - 发行者
- `algorithm` - 算法
- `digits` - 位数
- `period` - 周期

## 故障排除

### 常见问题

1. **扫描失败**

   - 检查二维码清晰度
   - 确保光线充足
   - 尝试手动输入密钥

2. **验证码错误**

   - 检查时间同步
   - 确认使用正确的应用
   - 验证密钥输入正确

3. **应用不识别**
   - 确认应用支持 TOTP
   - 检查 URL 格式是否正确
   - 尝试不同的 Authenticator 应用

### 调试方法

1. **查看生成的 URL**

   ```typescript
   console.log("otpauth URL:", otpauthUrl);
   ```

2. **验证 URL 格式**

   ```typescript
   const isValid = urlPattern.test(otpauthUrl);
   ```

3. **检查参数完整性**
   ```typescript
   const hasAllParams = requiredParams.every((param) =>
     otpauthUrl.includes(`${param}=`)
   );
   ```

## 最佳实践

1. **密钥安全**

   - 使用 32 字符的随机密钥
   - 避免在日志中记录完整密钥
   - 定期更换密钥

2. **用户体验**

   - 提供清晰的使用说明
   - 支持手动输入密钥
   - 提供备用恢复码

3. **兼容性**
   - 遵循 TOTP 标准
   - 测试多种 Authenticator 应用
   - 提供降级方案

## 总结

当前的 TOTP 实现完全符合标准，传递给 Authenticator 应用的内容包含所有必要参数：

- ✅ 正确的 otpauth URL 格式
- ✅ 完整的 TOTP 参数
- ✅ 优化的二维码质量
- ✅ 良好的用户体验
- ✅ 广泛的兼容性

这确保了用户可以使用任何标准的 Authenticator 应用成功扫描二维码并生成验证码。
