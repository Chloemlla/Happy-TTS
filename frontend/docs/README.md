# Synapse API 文档

这是 Synapse 文本转语音服务的 API 文档站点，基于 Docusaurus 构建，具有现代化的 UI 设计和丰富的功能。

## 🎨 美化特性

### 视觉设计

- **现代化配色方案**: 使用 Synapse 品牌色彩（蓝色渐变主题）
- **响应式设计**: 完美适配桌面端和移动端
- **深色模式支持**: 自动适配系统主题偏好
- **动画效果**: 平滑的过渡动画和悬停效果

### 自定义组件

- **动态 Logo**: 带有动画效果的语音波形图标
- **美化首页**: 包含特色功能展示、快速开始指南和技术栈展示
- **自定义图标**: 为每个特性创建了专门的 SVG 图标
- **社交卡片**: 优化的社交媒体分享图片

### 用户体验

- **导航优化**: 毛玻璃效果的导航栏，清晰的侧边栏结构
- **代码高亮**: 优化的代码块样式和语法高亮
- **表格美化**: 现代化的表格设计，支持悬停效果
- **按钮样式**: 渐变按钮设计，带有悬停动画

## 🚀 快速开始

### 开发模式

```bash
cd frontend/docs
npm install
npm start
```

### 生产构建

```bash
npm run build
npm run serve
```

### 一键启动

- **Windows**: 双击 `start-docs.bat`
- **Linux/Mac**: 执行 `./start-docs.sh`

## 📁 项目结构

```
frontend/docs/
├── src/
│   ├── components/          # 自定义组件
│   ├── css/                # 全局样式
│   └── pages/              # 页面组件
├── static/
│   └── img/                # 图片资源
├── docs/                   # 文档内容
├── docusaurus.config.ts    # 配置文件
└── sidebars.ts            # 侧边栏配置
```

## 🎯 主要功能

### 1. API 文档

- 完整的接口说明
- 请求/响应示例
- 错误代码说明
- 认证机制介绍

### 2. 快速开始

- 分步骤的集成指南
- 代码示例
- 最佳实践

### 3. 教程

- 基础使用教程
- 高级功能说明
- 集成示例

## 🔧 自定义配置

### 主题色彩

在 `src/css/custom.css` 中可以修改：

- 主色调 (`--ifm-color-primary`)
- 辅助色彩
- 背景和文字颜色

### 组件样式

- 首页样式: `src/pages/index.module.css`
- 特性组件: `src/components/HomepageFeatures/styles.module.css`

### 图标资源

- Logo: `static/img/logo.svg`
- Favicon: `static/img/favicon.svg`
- 社交卡片: `static/img/social-card.svg`
- 特性图标: `static/img/feature-*.svg`

## 🌐 部署

### 本地部署

```bash
npm run build
npm run serve
```

### Docker 部署

```bash
docker build -t Synapse-docs .
docker run -p 3002:3002 Synapse-docs
```

## 📝 维护

### 添加新文档

1. 在 `docs/` 目录下创建 Markdown 文件
2. 在 `sidebars.ts` 中添加导航配置
3. 更新相关链接

### 修改样式

1. 编辑 `src/css/custom.css` 修改全局样式
2. 编辑对应的 `.module.css` 文件修改组件样式
3. 重启开发服务器查看效果

### 更新图标

1. 替换 `static/img/` 目录下的 SVG 文件
2. 更新配置文件中的引用路径
3. 清除缓存并重新构建

## 🤝 贡献

欢迎提交 Issue 和 Pull Request 来改进文档！

## �� 许可证

MIT License
