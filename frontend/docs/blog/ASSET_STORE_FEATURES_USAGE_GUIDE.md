# 资源商店功能使用指南

## 功能概述

本系统实现了完整的资源商店功能，包括用户端的资源浏览和CDK兑换，以及管理员端的资源和CDK管理。

## 功能特性

### 🛍️ 用户端功能

1. **资源展示**
   - 首页展示所有可用资源列表
   - 资源卡片显示：标题、描述、价格、分类、图片
   - 支持资源分类筛选（软件、游戏、教程、素材、其他）
   - 响应式网格布局，支持桌面和移动设备

2. **CDK兑换系统**
   - 用户输入CDK兑换码解锁资源
   - 实时验证CDK有效性
   - 防止重复使用（每个CDK只能使用一次）
   - 支持CDK过期时间检查
   - 兑换成功后显示下载链接

3. **资源详情页**
   - 查看资源详细信息
   - 显示资源描述、价格、分类等完整信息

### 🔧 管理员端功能

1. **管理员认证**
   - 管理员登录/登出功能
   - 使用现有的认证系统，共用账号数据
   - 严格验证管理员身份权限

2. **仪表板统计**
   - 总资源数量统计
   - 总CDK数量统计
   - 已使用CDK数量统计
   - 可用CDK数量统计

3. **资源管理**
   - 添加资源：设置标题、描述、下载链接、价格、分类、图片
   - 编辑资源：修改现有资源的所有信息
   - 删除资源：删除资源及相关的所有CDK
   - 资源列表：查看所有资源，支持排序和搜索

4. **CDK管理**
   - 生成CDK：为指定资源批量生成CDK兑换码
   - 查看CDK：显示所有CDK及其使用状态
   - 删除CDK：删除未使用的CDK
   - CDK状态跟踪：显示CDK是否已使用、使用时间、使用IP

## 📚 API接口

### 资源相关API

- `GET /api/resources` - 获取资源列表（支持分页和分类筛选）
- `GET /api/resources/:id` - 获取资源详情
- `GET /api/categories` - 获取资源分类列表
- `GET /api/resources/stats` - 获取资源统计信息（管理员）
- `POST /api/resources` - 创建资源（管理员）
- `PUT /api/resources/:id` - 更新资源（管理员）
- `DELETE /api/resources/:id` - 删除资源（管理员）

### CDK相关API

- `POST /api/redeem` - CDK兑换接口
- `GET /api/cdks` - 获取CDK列表（管理员）
- `GET /api/cdks/stats` - 获取CDK统计信息（管理员）
- `POST /api/cdks/generate` - 生成CDK（管理员）
- `DELETE /api/cdks/:id` - 删除CDK（管理员）

## 🗂️ 数据模型

### Resource（资源模型）

```typescript
interface Resource {
  id: string;
  title: string; // 标题
  description: string; // 描述
  downloadUrl: string; // 下载链接
  price: number; // 价格
  category: string; // 分类
  imageUrl: string; // 图片URL
  isActive: boolean; // 激活状态
  createdAt: Date; // 创建时间
  updatedAt: Date; // 更新时间
}
```

### CDK（兑换码模型）

```typescript
interface CDK {
  id: string;
  code: string; // 兑换码
  resourceId: string; // 关联资源ID
  isUsed: boolean; // 使用状态
  usedAt?: Date; // 使用时间
  usedIp?: string; // 使用IP
  expiresAt?: Date; // 过期时间
  createdAt: Date; // 创建时间
}
```

## 🚀 使用说明

### 前端路由

- `/store` - 资源商店首页
- `/store/resources/:id` - 资源详情页
- `/admin/login` - 管理员登录页
- `/admin/store` - 管理员仪表板
- `/admin/store/resources` - 资源管理页面
- `/admin/store/cdks` - CDK管理页面

### 部署说明

1. **后端部署**
   - 确保所有路由已在 `src/app.ts` 中注册
   - 新增的路由已添加到应用中

2. **前端部署**
   - 使用 `ResourceStoreApp` 组件作为独立的资源商店应用
   - 所有组件都已创建并可正常使用

3. **认证集成**
   - 使用现有的用户认证系统
   - 管理员权限验证已集成到中间件中

### 注意事项

1. **安全性**
   - 所有管理员操作都需要验证管理员身份
   - CDK兑换有防重复使用机制
   - 过期CDK自动失效

2. **性能**
   - 资源列表支持分页
   - 图片懒加载优化
   - 组件按需懒加载

3. **用户体验**
   - 响应式设计适配各种设备
   - 错误提示友好
   - 加载状态清晰

## 📝 开发备注

- 前端API基础URL会根据环境自动配置 [[memory:5580500]]
- 所有管理员操作都经过严格的权限验证
- 使用了现有的认证系统，无需单独存储账号数据
- 组件命名避免了与现有文件的冲突
- **完全使用Mongoose进行数据库操作**
- **完整的日志记录和错误处理**
- **并发控制和事务支持**
- **IPFS上传和短链生成的并发安全**

## 🗄️ 数据库集成

### 模型定义

- `ResourceModel`: 资源模型，包含标题、描述、下载链接、价格、分类等字段
- `CDKModel`: CDK模型，包含兑换码、关联资源ID、使用状态、过期时间等字段

### 数据库操作

- 所有CRUD操作都通过Mongoose进行
- 支持分页查询和条件筛选
- 完整的错误处理和日志记录
- 数据验证和约束
- **并发控制机制**
  - CDK兑换使用原子操作避免重复使用
  - 资源更新使用乐观锁机制
  - 批量操作使用数据库事务
- **性能优化**
  - 数据库索引优化查询性能
  - 连接池配置提高并发能力
  - 重试机制处理临时错误

### 初始化脚本

运行以下命令初始化数据库：

```bash
npx ts-node src/scripts/init-database.ts
```

这个资源商店系统可以独立运行，也可以集成到现有的应用中使用。
