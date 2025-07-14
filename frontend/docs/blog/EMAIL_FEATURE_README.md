# 邮件发送功能说明

## 功能概述

本项目已集成基于 Resend 的邮件发送功能，仅限管理员使用。支持HTML和纯文本两种邮件格式，具备完整的邮箱验证、预览和发送功能。

## 功能特性

### 🎯 核心功能

- ✅ HTML邮件发送（支持富文本格式）
- ✅ 纯文本邮件发送
- ✅ 多收件人支持（最多10个）
- ✅ 实时邮箱格式验证
- ✅ HTML邮件预览功能
- ✅ 邮件模板快速插入
- ✅ 服务状态监控

### 🔒 安全特性

- ✅ 仅管理员可访问
- ✅ 邮箱格式验证
- ✅ 发送频率限制（每分钟最多5封）
- ✅ 内容长度限制
- ✅ 完整的错误处理

### 🎨 界面特性

- ✅ 响应式设计（支持桌面和移动端）
- ✅ 精美的动画效果
- ✅ 直观的操作界面
- ✅ 实时状态反馈
- ✅ 帮助面板

## 安装配置

### 1. 安装依赖

```bash
# 运行安装脚本
node install-resend.js

# 或手动安装
npm install resend
```

### 2. 环境变量配置

在项目根目录创建或更新 `.env` 文件：

```env
# Resend API密钥（必需）
RESEND_API_KEY=re_xxxxxxxxx

# 默认发件人邮箱（可选）
DEFAULT_EMAIL_FROM=noreply@yourdomain.com
```

### 3. 获取 Resend API 密钥

1. 访问 [Resend官网](https://resend.com)
2. 注册并登录账户
3. 在控制台获取API密钥
4. 配置发件人域名（可选）

## 使用方法

### 管理员访问

1. 使用管理员账户登录系统
2. 在导航菜单中点击"邮件发送"
3. 或直接访问 `/email-sender` 路径

### 发送邮件

#### HTML模式

1. 选择"HTML模式"
2. 填写发件人邮箱
3. 添加收件人邮箱（可添加多个）
4. 输入邮件主题
5. 编写HTML内容（可使用模板工具）
6. 点击"预览"查看效果
7. 点击"发送邮件"

#### 简单模式

1. 选择"简单模式"
2. 填写发件人邮箱
3. 添加收件人邮箱
4. 输入邮件主题
5. 编写纯文本内容
6. 点击"发送邮件"

## API接口

### 发送HTML邮件

```http
POST /api/email/send
Authorization: Bearer <token>
Content-Type: application/json

{
  "from": "sender@example.com",
  "to": ["recipient1@example.com", "recipient2@example.com"],
  "subject": "邮件主题",
  "html": "<h1>Hello World</h1><p>这是一封测试邮件。</p>",
  "text": "纯文本版本（可选）"
}
```

### 发送简单邮件

```http
POST /api/email/send-simple
Authorization: Bearer <token>
Content-Type: application/json

{
  "from": "sender@example.com",
  "to": ["recipient@example.com"],
  "subject": "邮件主题",
  "content": "邮件内容"
}
```

### 验证邮箱格式

```http
POST /api/email/validate
Authorization: Bearer <token>
Content-Type: application/json

{
  "emails": ["test@example.com", "invalid-email"]
}
```

### 查询服务状态

```http
GET /api/email/status
Authorization: Bearer <token>
```

## 文件结构

```
src/
├── services/
│   └── emailService.ts          # 邮件服务核心逻辑
├── controllers/
│   └── emailController.ts       # 邮件控制器
├── routes/
│   └── emailRoutes.ts          # 邮件路由
└── app.ts                      # 主应用（已集成路由）

frontend/src/
├── components/
│   ├── EmailSender.tsx         # 邮件发送页面
│   └── MobileNav.tsx           # 导航菜单（已更新）
└── App.tsx                     # 主应用（已添加路由）
```

## 权限控制

- **访问权限**：仅管理员（role === 'admin'）可访问
- **API权限**：所有邮件相关API都需要管理员权限
- **速率限制**：
  - 邮件发送：每分钟最多5次
  - 邮箱验证：每分钟最多20次
  - 状态查询：每分钟最多10次

## 错误处理

### 常见错误

- `400` - 请求参数错误（缺少必填字段、邮箱格式无效等）
- `401` - 未授权（未登录或token无效）
- `403` - 权限不足（非管理员用户）
- `429` - 请求过于频繁
- `500` - 服务器错误（邮件服务异常等）

### 错误响应格式

```json
{
  "success": false,
  "error": "错误描述",
  "invalidEmails": ["invalid@email"] // 邮箱验证错误时返回
}
```

## 开发说明

### 添加新的邮件模板

在 `EmailSender.tsx` 中的 `htmlTemplates` 数组中添加新模板：

```typescript
const htmlTemplates = [
  // ... 现有模板
  { name: "新模板", code: "<div>新模板内容</div>" },
];
```

### 自定义邮件服务

可以修改 `emailService.ts` 来支持其他邮件服务提供商：

```typescript
// 替换 Resend 为其他服务
import { OtherEmailService } from "other-email-service";
```

### 扩展功能

- 添加邮件附件支持
- 实现邮件模板管理
- 添加邮件发送历史记录
- 支持邮件群发功能

## 注意事项

1. **API密钥安全**：请妥善保管 Resend API 密钥，不要提交到版本控制系统
2. **发件人域名**：建议配置已验证的发件人域名以提高邮件送达率
3. **内容限制**：HTML内容限制50KB，纯文本内容限制10KB
4. **收件人限制**：单次发送最多10个收件人
5. **频率限制**：请遵守发送频率限制，避免被标记为垃圾邮件

## 故障排除

### 邮件发送失败

1. 检查 Resend API 密钥是否正确
2. 确认发件人邮箱格式有效
3. 验证收件人邮箱格式
4. 检查网络连接

### 服务状态异常

1. 检查环境变量配置
2. 确认 Resend 账户状态
3. 查看服务器日志

### 权限问题

1. 确认用户角色为管理员
2. 检查登录状态
3. 验证token有效性

## 更新日志

### v1.0.0 (2024-01-XX)

- ✅ 初始版本发布
- ✅ 支持HTML和纯文本邮件
- ✅ 完整的权限控制
- ✅ 响应式界面设计
- ✅ 实时预览功能
