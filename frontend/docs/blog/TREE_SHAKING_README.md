# 摇树优化使用指南

## 概述

本项目已集成完整的摇树优化（Tree Shaking）配置，可以显著减少最终 bundle 的大小，提升应用性能。

## 快速开始

### 1. 检查配置

```bash
# 检查摇树优化配置是否正确
npm run check:tree-shaking-config
```

### 2. 分析 Bundle 大小

```bash
# 完整分析（前后端）
npm run analyze:full

# 仅分析前端
npm run analyze:frontend

# 仅分析后端
npm run analyze:backend
```

### 3. 检查未使用的依赖

```bash
# 检查未使用的依赖
npm run check:unused-deps
```

## 配置说明

### 前端配置

#### Vite 配置 (`frontend/vite.config.ts`)

- ✅ 增强的摇树优化配置
- ✅ 精细的代码分割策略
- ✅ 优化的依赖预构建
- ✅ 生产环境代码混淆

#### Package.json 配置

```json
{
  "sideEffects": ["*.css", "*.scss", "*.sass", "*.less"]
}
```

### 后端配置

#### TypeScript 配置 (`tsconfig.json`)

- ✅ `importHelpers: true` - 减少重复代码
- ✅ `isolatedModules: true` - 支持更好的摇树优化
- ✅ `removeComments: true` - 移除注释
- ✅ `sourceMap: false` - 禁用源码映射

#### Package.json 配置

```json
{
  "sideEffects": false
}
```

## 代码分割策略

### 前端代码分割

```typescript
manualChunks: {
  'react-vendor': ['react', 'react-dom'],
  'router': ['react-router-dom'],
  'ui': ['@radix-ui/react-dialog', 'lucide-react', 'react-icons'],
  'utils': ['axios', 'clsx', 'tailwind-merge'],
  'auth': ['@simplewebauthn/browser', 'qrcode.react'],
  'animations': ['framer-motion'],
  'code-highlight': ['react-syntax-highlighter', 'prismjs'],
  'toast': ['react-toastify'],
  'swagger': ['swagger-ui-react']
}
```

## 最佳实践

### 导入优化

#### ✅ 推荐做法

```typescript
// 具名导入 - 支持摇树优化
import { useState, useEffect } from "react";
import { Button } from "@radix-ui/react-dialog";
import { format } from "date-fns";

// 动态导入 - 代码分割
const LazyComponent = lazy(() => import("./LazyComponent"));
```

#### ❌ 避免做法

```typescript
// 避免默认导入整个库
import * as React from "react";
import * as dateFns from "date-fns";

// 避免导入有副作用的模块
import "some-library/dist/index.css";
```

### 依赖管理

1. **定期检查未使用的依赖**

   ```bash
   npm run check:unused-deps
   ```

2. **使用精确版本**

   ```json
   {
     "dependencies": {
       "react": "^18.2.0" // 使用 ^ 而不是 ~
     }
   }
   ```

3. **移除开发依赖**
   ```bash
   npm prune --production
   ```

## 监控和维护

### 定期检查

```bash
# 每周运行一次完整分析
npm run analyze:full

# 检查配置是否正确
npm run check:tree-shaking-config

# 检查未使用的依赖
npm run check:unused-deps
```

### 性能指标

- **前端目标**: < 1MB (gzipped)
- **后端目标**: < 500KB (gzipped)
- **预期优化效果**: 减少 30-50%的 bundle 大小

### 自动化集成

在 CI/CD 流程中添加：

```yaml
# 示例 GitHub Actions 配置
- name: 检查Bundle大小
  run: |
    npm run build
    npm run analyze:full
    npm run check:tree-shaking-config
```

## 故障排除

### 常见问题

1. **某些代码没有被摇树优化移除**

   - 检查是否有副作用代码
   - 确认使用 ES6 模块语法
   - 验证第三方库是否支持摇树优化

2. **Bundle 大小没有减少**

   - 运行 `npm run check:tree-shaking-config` 检查配置
   - 检查是否有未使用的依赖
   - 验证代码分割配置

3. **构建失败**
   - 检查 TypeScript 配置
   - 验证依赖版本兼容性
   - 查看构建日志

### 调试工具

```bash
# 详细分析
npm run analyze:full

# 检查配置
npm run check:tree-shaking-config

# 检查依赖
npm run check:unused-deps
```

## 相关文档

- [摇树优化最佳实践](./docs/tree-shaking-best-practices.md)
- [Vite 官方文档](https://vitejs.dev/guide/build.html)
- [Webpack 摇树优化](https://webpack.js.org/guides/tree-shaking/)

## 支持

如果遇到问题，请：

1. 运行诊断命令
2. 查看相关文档
3. 检查 GitHub Issues
4. 提交新的 Issue

---

**注意**: 摇树优化是一个持续的过程，建议定期检查和优化配置。
