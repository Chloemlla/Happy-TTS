# Synapse API 文档索引

欢迎使用 Synapse API 文档！本文档提供了完整的接口参考和使用指南。

## 📚 文档导航

### 快速开始

- [快速入门指南](./quick-start.md) - 5 分钟上手教程
- [完整 API 文档](./backend-api.md) - 详细的接口参考

### 按功能分类

#### 🔐 用户认证

- **注册**: `POST /api/auth/register` - 用户注册
- **登录**: `POST /api/auth/login` - 用户登录
- **用户信息**: `GET /api/auth/me` - 获取当前用户信息

#### 🎵 文本转语音 (TTS)

- **生成语音**: `POST /api/tts/generate` - 文本转语音
- **生成历史**: `GET /api/tts/history` - 获取生成记录

#### 🔒 双因素认证 (TOTP)

- **生成设置**: `POST /api/totp/generate-setup` - 生成 TOTP 二维码
- **验证启用**: `POST /api/totp/verify-and-enable` - 验证并启用 TOTP
- **验证令牌**: `POST /api/totp/verify-token` - 验证 TOTP 令牌
- **禁用 TOTP**: `POST /api/totp/disable` - 禁用双因素认证
- **获取状态**: `GET /api/totp/status` - 获取 TOTP 状态
- **备用恢复码**: `GET /api/totp/backup-codes` - 获取备用恢复码
- **重新生成恢复码**: `POST /api/totp/regenerate-backup-codes` - 重新生成备用恢复码

#### 🔑 Passkey 认证

- **获取凭证**: `GET /api/passkey/credentials` - 获取 Passkey 凭证列表
- **开始注册**: `POST /api/passkey/register/start` - 开始 Passkey 注册
- **完成注册**: `POST /api/passkey/register/finish` - 完成 Passkey 注册
- **开始认证**: `POST /api/passkey/authenticate/start` - 开始 Passkey 认证
- **完成认证**: `POST /api/passkey/authenticate/finish` - 完成 Passkey 认证

#### 👨‍💼 管理员功能

- **用户列表**: `GET /api/admin/users` - 获取所有用户
- **创建用户**: `POST /api/admin/users` - 创建新用户
- **更新用户**: `PUT /api/admin/users/:id` - 更新用户信息
- **删除用户**: `DELETE /api/admin/users/:id` - 删除用户

#### 🖥️ 系统管理

- **服务状态**: `GET /api/status` - 检查服务状态
- **添加命令**: `POST /api/command/y` - 添加待执行命令
- **获取命令**: `GET /api/command/q` - 获取下一个命令
- **移除命令**: `POST /api/command/p` - 移除命令
- **执行命令**: `POST /api/command/execute` - 直接执行命令
- **服务器状态**: `POST /api/command/status` - 获取服务器状态

#### 🤖 LibreChat 集成

- **镜像信息**: `GET /api/libre-chat/lc` - 获取最新镜像信息
- **发送消息**: `POST /api/libre-chat/send` - 发送聊天消息
- **聊天历史**: `GET /api/libre-chat/history` - 获取聊天历史
- **清除历史**: `DELETE /api/libre-chat/clear` - 清除聊天历史

#### 📊 数据收集

- **数据收集**: `POST /api/data-collection/collect_data` - 通用数据收集接口

#### 📝 日志管理

- **上传日志**: `POST /api/sharelog` - 上传日志文件
- **查询日志**: `POST /api/sharelog/:id` - 查询日志文件内容

#### 🛡️ 安全防护

- **上报篡改**: `POST /api/tamper/report-tampering` - 上报篡改事件

#### 🌐 其他接口

- **IP 信息**: `GET /ip` - 获取客户端 IP 信息
- **上报 IP**: `POST /api/report-ip` - 上报公网 IP 地址

## 🚀 快速开始

### 1. 基础认证流程

```javascript
// 1. 注册用户
const registerResult = await fetch("/api/auth/register", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ username: "testuser", password: "password123" }),
});

// 2. 登录获取token
const loginResult = await fetch("/api/auth/login", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ username: "testuser", password: "password123" }),
});

const { token } = await loginResult.json();
```

### 2. 生成语音

```javascript
// 3. 使用token生成语音
const ttsResult = await fetch("/api/tts/generate", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  },
  body: JSON.stringify({
    text: "你好，世界！",
    voice: "alloy",
    speed: 1.0,
  }),
});

const { audioUrl } = await ttsResult.json();
// 播放音频
new Audio(audioUrl).play();
```

## 📋 接口状态码

| 状态码 | 说明                 |
| ------ | -------------------- |
| 200    | 请求成功             |
| 201    | 创建成功             |
| 400    | 请求参数错误         |
| 401    | 未认证或认证失败     |
| 403    | 权限不足             |
| 404    | 资源不存在           |
| 429    | 请求过于频繁（限流） |
| 500    | 服务器内部错误       |

## 🔧 开发工具

### API 测试工具

- **Swagger UI**: `/api-docs` - 在线 API 文档和测试工具
- **OpenAPI 规范**: `/api-docs.json` - OpenAPI 3.0 规范文件

### 限流信息

系统对不同类型的接口实施了限流保护：

| 接口类型     | 限制            |
| ------------ | --------------- |
| TTS 生成     | 每分钟 10 次    |
| 认证接口     | 每分钟 30 次    |
| TOTP 操作    | 每 5 分钟 20 次 |
| Passkey 操作 | 每 5 分钟 30 次 |
| 管理员操作   | 每分钟 50 次    |

## 📖 更多资源

- [SDK 文档](../sdk/) - 各种编程语言的 SDK
- [最佳实践](../best-practices/) - 安全和使用建议
- [教程](../tutorials/) - 详细的使用教程
- [错误代码](./error-codes.md) - 错误代码说明

## 🤝 支持

如果您在使用过程中遇到问题：

1. 查看 [常见问题](../tutorials/faq.md)
2. 检查 [错误代码](./error-codes.md)
3. 参考 [最佳实践](../best-practices/)
4. 联系技术支持

---

**Synapse API** - 让文本转语音变得简单高效！ 🎵
