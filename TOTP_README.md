# TOTP 二次验证功能说明

## 功能概述

本项目已成功集成了 TOTP（基于时间的一次性密码）二次验证功能，为用户的账户安全提供额外的保护层。

## 功能特性

### 🔐 安全特性

- **TOTP 验证**: 使用标准 TOTP 算法生成 6 位数字验证码
- **备用恢复码**: 提供 10 个 8 位恢复码，防止设备丢失
- **时间窗口验证**: 支持前后 30 秒的时间窗口，提高用户体验
- **安全密钥**: 使用 32 位随机密钥，确保安全性

### 🎨 用户界面

- **美观的 UI 设计**: 使用现代化的设计语言，提供良好的用户体验
- **响应式布局**: 支持各种设备尺寸
- **动画效果**: 使用 Framer Motion 提供流畅的动画效果
- **状态指示**: 清晰显示 TOTP 启用状态

### 🔧 技术实现

- **前端**: React + TypeScript + Tailwind CSS
- **后端**: Node.js + Express + TypeScript
- **TOTP 库**: speakeasy + qrcode
- **QR 码**: 支持扫描和手动输入两种方式

## 使用方法

### 1. 设置 TOTP 二次验证

1. **登录账户**: 使用用户名/邮箱和密码登录
2. **访问设置**: 点击顶部导航栏的"二次验证"按钮
3. **生成设置**: 点击"设置二次验证"按钮
4. **扫描 QR 码**:
   - 使用认证器应用（如 Google Authenticator、Microsoft Authenticator 等）扫描 QR 码
   - 或手动输入密钥到认证器应用中
5. **验证设置**: 输入认证器应用显示的 6 位验证码
6. **保存恢复码**: 妥善保存显示的 10 个 8 位恢复码

### 2. 登录时使用 TOTP

1. **输入凭据**: 输入用户名/邮箱和密码
2. **TOTP 验证**:
   - 如果启用了 TOTP，系统会要求输入验证码
   - 输入认证器应用显示的 6 位验证码
   - 或使用备用恢复码登录

### 3. 管理 TOTP 设置

- **查看状态**: 在二次验证页面查看当前状态
- **禁用 TOTP**: 点击"禁用二次验证"并输入当前验证码
- **重新设置**: 可以随时重新生成新的 TOTP 设置

## 支持的认证器应用

- Google Authenticator
- Microsoft Authenticator
- Authy
- 1Password
- Bitwarden
- 其他支持 TOTP 的应用

## 安全建议

1. **保护恢复码**: 将恢复码保存在安全的地方，不要分享给他人
2. **定期更换**: 建议定期更换 TOTP 设置
3. **多设备同步**: 可以在多个设备上使用同一个 TOTP 账户
4. **备份重要**: 确保在设备丢失时有备用恢复码

## API 接口

### 后端 API

- `POST /api/totp/generate-setup` - 生成 TOTP 设置
- `POST /api/totp/verify-and-enable` - 验证并启用 TOTP
- `POST /api/totp/verify-token` - 验证 TOTP 令牌（登录时使用）
- `POST /api/totp/disable` - 禁用 TOTP
- `GET /api/totp/status` - 获取 TOTP 状态

### 前端组件

- `TOTPSetup` - TOTP 设置组件
- `TOTPManager` - TOTP 管理组件
- `TOTPVerification` - TOTP 验证组件

## 技术细节

### 密钥生成

```typescript
const secret = speakeasy.generateSecret({
  name: `Synapse (${username})`,
  issuer: "Synapse",
  length: 32,
}).base32;
```

### 验证逻辑

```typescript
const isValid = speakeasy.totp.verify({
  secret,
  encoding: "base32",
  token,
  window: 1, // 支持前后30秒
});
```

### QR 码生成

```typescript
const otpauthUrl = speakeasy.otpauthURL({
  secret,
  label: username,
  issuer: "Synapse",
  algorithm: "sha1",
  digits: 6,
  period: 30,
});
```

## 故障排除

### 常见问题

1. **验证码错误**

   - 检查设备时间是否同步
   - 确认使用的是正确的认证器应用
   - 尝试使用备用恢复码

2. **QR 码无法扫描**

   - 手动输入密钥到认证器应用
   - 检查 QR 码是否清晰可见
   - 尝试调整屏幕亮度

3. **恢复码无效**
   - 确认输入的是完整的 8 位恢复码
   - 检查是否已经使用过该恢复码
   - 联系管理员重置 TOTP 设置

### 联系支持

如果遇到问题，请联系系统管理员或查看系统日志获取更多信息。

## 更新日志

- **v1.0.0**: 初始 TOTP 功能实现
  - 支持 TOTP 设置和验证
  - 提供备用恢复码功能
  - 美观的用户界面
  - 完整的 API 支持
