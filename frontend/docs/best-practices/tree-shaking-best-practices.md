# 摇树优化最佳实践

## 概述

摇树优化（Tree Shaking）是一种通过静态分析来移除未使用代码的技术，可以显著减少最终 bundle 的大小。本文档介绍在 Synapse 项目中实施摇树优化的最佳实践。

## 前端优化

### 1. 配置优化

#### Vite 配置 (`frontend/vite.config.ts`)

```typescript
// 增强摇树优化配置
treeshake: {
  moduleSideEffects: false,
  propertyReadSideEffects: false,
  unknownGlobalSideEffects: false,
  tryCatchDeoptimization: false
}
```

#### 代码分割策略

```typescript
manualChunks: {
  'react-vendor': ['react', 'react-dom'],
  'router': ['react-router-dom'],
  'ui': ['@radix-ui/react-dialog', 'react-icons'],
  'utils': ['axios', 'clsx', 'tailwind-merge'],
  'auth': ['@simplewebauthn/browser', 'qrcode.react'],
  'animations': ['framer-motion'],
  'code-highlight': ['react-syntax-highlighter', 'prismjs'],
  'toast': ['react-toastify'],
  'swagger': ['swagger-ui-react']
}
```

### 2. Package.json 配置

```json
{
  "sideEffects": ["*.css", "*.scss", "*.sass", "*.less"]
}
```

### 3. 导入优化

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

## 后端优化

### 1. TypeScript 配置 (`tsconfig.json`)

```json
{
  "compilerOptions": {
    "importHelpers": true,
    "isolatedModules": true,
    "removeComments": true,
    "sourceMap": false,
    "declaration": false,
    "useDefineForClassFields": true
  }
}
```

### 2. Package.json 配置

```json
{
  "sideEffects": false
}
```

### 3. 模块导入优化

#### ✅ 推荐做法

```typescript
// 具名导入
import { Router } from "express";
import { createHash } from "crypto";
import { readFileSync } from "fs";

// 按需导入
import { rateLimit } from "express-rate-limit";
```

#### ❌ 避免做法

```typescript
// 避免导入整个模块
import * as express from "express";
import * as crypto from "crypto";
```

## 分析工具

### 1. Bundle 分析

```bash
# 前端分析
npm run build:analyze

# 后端分析
npm run analyze:bundle

# 完整分析
node scripts/analyze-bundle.js
```

### 2. 依赖分析

```bash
# 检查未使用的依赖
npm ls --depth=0

# 分析依赖大小
npx webpack-bundle-analyzer dist/stats.json
```

## 最佳实践检查清单

### 前端检查项

- [ ] 使用 ES6 模块语法 (`import`/`export`)
- [ ] 避免导入整个库，使用具名导入
- [ ] 配置正确的`sideEffects`
- [ ] 使用动态导入进行代码分割
- [ ] 移除未使用的依赖
- [ ] 优化图片和静态资源

### 后端检查项

- [ ] 使用 TypeScript 严格模式
- [ ] 配置`isolatedModules`
- [ ] 移除开发依赖
- [ ] 使用具名导入
- [ ] 检查未使用的模块

### 通用检查项

- [ ] 定期运行 bundle 分析
- [ ] 监控 bundle 大小变化
- [ ] 测试生产构建
- [ ] 验证功能完整性

## 性能指标

### 目标大小

- **前端**: < 1MB (gzipped)
- **后端**: < 500KB (gzipped)

### 优化效果

- 减少 30-50%的 bundle 大小
- 提升页面加载速度
- 改善用户体验

## 常见问题

### Q: 为什么某些代码没有被摇树优化移除？

A: 可能的原因：

1. 代码有副作用（如修改全局变量）
2. 使用了 CommonJS 模块
3. 动态导入路径
4. 第三方库不支持摇树优化

### Q: 如何检查摇树优化是否生效？

A:

1. 运行 bundle 分析工具
2. 检查生产构建的 bundle 大小
3. 使用 webpack-bundle-analyzer 可视化分析

### Q: 如何处理有副作用的代码？

A:

1. 将副作用代码移到单独的文件
2. 在 package.json 中标记为有副作用
3. 使用动态导入延迟加载

## 监控和维护

### 1. 定期检查

- 每周运行 bundle 分析
- 监控依赖更新对 bundle 大小的影响
- 检查新添加的依赖是否支持摇树优化

### 2. 自动化

- 在 CI/CD 中集成 bundle 大小检查
- 设置 bundle 大小阈值告警
- 自动生成 bundle 分析报告

### 3. 团队协作

- 代码审查时检查导入方式
- 新依赖添加前评估对 bundle 大小的影响
- 定期分享优化经验和最佳实践
