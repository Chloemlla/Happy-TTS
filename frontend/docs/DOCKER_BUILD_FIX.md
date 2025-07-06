# Docker 构建问题解决方案

## 问题描述

在 Docker 环境中构建 Docusaurus 文档时，会出现以下 Git 相关警告：

```
[WARNING] Error: Command failed with exit code 128: git -c log.showSignature=false log --format=RESULT:%ct --max-count=1 --follow --diff-filter=A -- "filename.md"
fatal: not a git repository (or any of the parent directories): .git
```

这是因为 Docusaurus 默认会尝试获取文件的 Git 历史信息，但在 Docker 构建环境中没有 Git 仓库。

## 解决方案

### 1. 配置修改

已修改 `docusaurus.config.ts` 文件，禁用 Git 相关功能：

```typescript
docs: {
  sidebarPath: './sidebars.ts',
  // 禁用Git历史信息获取，避免在Docker环境中出现Git相关警告
  showLastUpdateTime: false,
  showLastUpdateAuthor: false,
},
blog: {
  // ... 其他配置
  showLastUpdateTime: false,
  showLastUpdateAuthor: false,
  // 禁用Git历史信息获取
  disableGitInfo: true,
}
```

### 2. 新增构建脚本

#### 无 Git 依赖构建脚本

创建了 `build-no-git.js` 脚本，专门用于 Docker 环境构建：

```bash
npm run build:no-git
```

#### Docker 专用构建脚本

创建了 `docker-build.sh` 脚本，包含完整的构建流程：

```bash
./docker-build.sh
```

#### 环境变量构建

新增了带环境变量的构建命令：

```bash
npm run build:docker
```

### 3. 使用方法

#### 本地开发

```bash
# 正常构建（需要Git仓库）
npm run build

# 无Git依赖构建
npm run build:no-git
```

#### Docker 环境

```bash
# 使用Docker构建脚本
./docker-build.sh

# 或使用环境变量构建
npm run build:docker
```

#### 备用方案

如果主要构建失败，会自动尝试简化构建：

```bash
npm run build:simple
```

### 4. 环境变量说明

以下环境变量用于禁用 Git 功能：

- `DISABLE_GIT_INFO=true` - 禁用 Git 信息获取
- `GIT_DISABLED=true` - 标记 Git 功能已禁用
- `DOCUSAURUS_DISABLE_GIT_INFO=true` - Docusaurus 专用 Git 禁用标记
- `NODE_ENV=production` - 生产环境模式

### 5. 构建输出

- 成功构建：输出到 `build/` 目录
- 简化构建：输出到 `build-simple/` 目录

### 6. 故障排除

如果仍然遇到 Git 相关警告：

1. 确保使用了正确的构建脚本
2. 检查环境变量是否正确设置
3. 清理缓存：`npm run clear`
4. 重新安装依赖：`rm -rf node_modules && npm install`

### 7. 注意事项

- 禁用 Git 功能后，文档将不会显示"最后更新时间"和"最后更新作者"
- 这不会影响文档的功能性，只是减少了元信息显示
- 在本地开发环境中，建议保持 Git 功能启用以获得更好的开发体验

## 相关文件

- `docusaurus.config.ts` - 主配置文件
- `build-no-git.js` - 无 Git 依赖构建脚本
- `docker-build.sh` - Docker 构建脚本
- `package.json` - 构建脚本配置
