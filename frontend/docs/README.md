# Synapse API 文档

这是 Synapse 项目的 API 文档站点，使用 Docusaurus 构建。

## 快速开始

### 安装依赖

```bash
npm install
```

### 启动开发服务器

```bash
npm run start
```

文档站点将在 http://localhost:3000 启动。

### 构建生产版本

```bash
npm run build
```

### 部署

```bash
npm run deploy
```

## 文档结构

```
docs/
├── docs/
│   ├── intro.md                    # 介绍页面
│   ├── getting-started.md          # 快速开始
│   ├── api/                        # API 文档
│   │   ├── authentication.md       # 认证机制
│   │   ├── tts-endpoints.md        # TTS 接口
│   │   ├── voice-management.md     # 语音管理
│   │   ├── user-management.md      # 用户管理
│   │   └── error-codes.md          # 错误代码
│   ├── tutorials/                  # 教程
│   │   ├── basic-usage.md          # 基础使用
│   │   ├── advanced-features.md    # 高级功能
│   │   └── integration-examples.md # 集成示例
│   ├── sdk/                        # SDK 文档
│   │   ├── javascript.md           # JavaScript SDK
│   │   ├── python.md               # Python SDK
│   │   └── java.md                 # Java SDK
│   └── best-practices/             # 最佳实践
│       ├── performance.md          # 性能优化
│       ├── security.md             # 安全实践
│       └── error-handling.md       # 错误处理
├── src/                            # 源代码
├── static/                         # 静态资源
└── docusaurus.config.ts            # 配置文件
```

## 配置说明

### 基础配置

- **站点标题**: Synapse API 文档
- **基础 URL**: `/`
- **默认语言**: 中文 (zh-Hans)

### 导航配置

- **API 文档**: 主要的 API 参考文档
- **教程**: 使用教程和示例
- **SDK**: 各种语言的 SDK 文档
- **最佳实践**: 开发最佳实践

## 开发指南

### 添加新文档

1. 在相应的目录下创建 `.md` 文件
2. 在文件头部添加 frontmatter：

```markdown
---
sidebar_position: 1
---

# 文档标题

文档内容...
```

3. 在 `sidebars.ts` 中添加导航项

### 修改配置

编辑 `docusaurus.config.ts` 文件来修改站点配置。

### 自定义样式

在 `src/css/custom.css` 中添加自定义样式。

## 部署

### GitHub Pages

1. 构建项目：`npm run build`
2. 将 `build` 目录的内容部署到 GitHub Pages

### 其他平台

可以将构建后的文件部署到任何静态文件托管服务。

## 贡献

欢迎提交 Pull Request 来改进文档！

## 许可证

本项目采用 MIT 许可证。
