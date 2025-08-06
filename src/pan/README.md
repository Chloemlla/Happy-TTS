# Pan - 管理员后台系统

## 概述

Pan是一个独立的管理员后台系统，提供完整的资源管理和CDK管理功能。

## 功能特性

### 🔧 管理员功能

- 管理员认证（登录/登出）
- 会话管理和安全认证
- 密码加密存储
- 登录状态保持

### 📊 仪表板统计

- 总资源数量统计
- 总CDK数量统计
- 已使用CDK数量统计
- 可用CDK数量统计
- 管理员最后登录时间显示

### 📦 资源管理

- 添加资源：设置标题、描述、下载链接、价格、分类、图片
- 编辑资源：修改现有资源的所有信息
- 删除资源：删除资源及相关的所有CDK
- 资源列表：查看所有资源，支持排序和搜索

### 🎫 CDK管理

- 生成CDK：为指定资源批量生成CDK兑换码
- 查看CDK：显示所有CDK及其使用状态
- 删除CDK：删除未使用的CDK
- CDK状态跟踪：显示CDK是否已使用、使用时间、使用IP

## 目录结构

```
pan/
├── README.md                 # 说明文档
├── package.json             # 项目配置
├── tsconfig.json            # TypeScript配置
├── src/
│   ├── app.ts               # 应用入口
│   ├── config/              # 配置文件
│   ├── models/              # 数据模型
│   ├── controllers/         # 控制器
│   ├── routes/              # 路由
│   ├── middleware/          # 中间件
│   ├── services/            # 服务层
│   ├── utils/               # 工具函数
│   └── types/               # 类型定义
├── tests/                   # 测试文件
└── dist/                    # 编译输出
```

## 快速开始

### 安装依赖

```bash
cd src/pan
npm install
```

### 配置环境变量

```bash
cp env.example .env
# 编辑 .env 文件，配置数据库连接等信息
```

### 初始化数据库

```bash
# 初始化数据库（保留现有数据）
npm run init-db

# 清空并重新初始化数据库
npm run init-db:clear
```

### 开发模式

```bash
npm run dev
```

### 生产构建

```bash
npm run build
npm start
```

## 数据库配置

### MongoDB 连接

确保MongoDB服务正在运行，默认连接地址：

```
mongodb://localhost:27017/synapse-pan
```

### 默认管理员账户

初始化后会自动创建默认管理员账户：

- 用户名：`admin`
- 密码：`admin123`
- 角色：`super_admin`

**注意：** 生产环境请务必修改默认密码！

## API接口

### 管理员认证

- `POST /admin/login` - 管理员登录
- `GET /admin/logout` - 管理员登出

### 资源管理

- `GET /admin/resources` - 获取资源列表
- `POST /admin/resources` - 创建资源
- `PUT /admin/resources/:id` - 更新资源
- `DELETE /admin/resources/:id` - 删除资源

### CDK管理

- `GET /admin/cdks` - 获取CDK列表
- `POST /admin/cdks/generate` - 生成CDK
- `DELETE /admin/cdks/:id` - 删除CDK

### 统计信息

- `GET /admin/stats` - 获取统计数据
