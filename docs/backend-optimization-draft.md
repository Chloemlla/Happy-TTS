# 后端优化完整草案

## 1. 目标与范围

本草案面向当前 Synapse 后端，目标不是“重写后端”，而是在不破坏现有功能的前提下，分阶段解决以下四类问题：

1. 可维护性不足：`src/app.ts` 体量过大，启动、路由、静态资源、迁移、初始化逻辑混杂。
2. 稳定性不足：启动阶段职责过多，存储模式切换与自修复逻辑复杂，失败边界不清晰。
3. 性能与资源利用不稳定：限流、日志、文件存储、启动时扫描和同步 I/O 仍有优化空间。
4. 可观测性不足：缺少统一指标、慢请求画像、关键链路 SLA 视角。

本草案优先覆盖后端核心运行面：

- 应用启动与装配
- 路由与中间件
- 存储层
- TTS/任务类业务
- 安全与限流
- 可观测性
- 测试与交付

## 2. 当前现状判断

结合当前代码，后端已经具备完整业务能力，但存在明显的“单体持续堆叠”特征。

### 2.1 入口文件过重

[`src/app.ts`](</F:/Repositories/GitHub/Synapse/src/app.ts:2>) 同时承担：

- 环境初始化
- 中间件注册
- 40+ 路由挂载
- Swagger 装配
- 静态资源服务
- 健康检查
- IP 数据记录
- 服务启动
- 存储初始化
- 调度器启动
- Mongo 迁移逻辑

问题是职责边界不清，任何一处改动都可能影响整体启动链路，测试也难以做细粒度隔离。

### 2.2 路由挂载与限流绑定分散

[`src/app.ts`](</F:/Repositories/GitHub/Synapse/src/app.ts:366>) 到 [`src/app.ts`](</F:/Repositories/GitHub/Synapse/src/app.ts:607>) 之间存在大量手工挂载；部分路由存在多次挂载或兼容路径并存，后续容易出现：

- 路由顺序依赖难以识别
- 限流器遗漏或重复绑定
- 兼容路径和正式路径行为不一致

### 2.3 存储层职责耦合

[`src/utils/userStorage.ts`](</F:/Repositories/GitHub/Synapse/src/utils/userStorage.ts:1>) 同时承担：

- 输入校验
- 文件读写
- Mongo/MySQL 初始化
- 自修复
- 自动切换
- 数据迁移
- 管理员账号创建

这不是单一存储抽象，而是“用户域 + 初始化器 + 迁移器 + 修复器”的混合体，导致后续扩展风险高。

### 2.4 限流体系可用，但仍偏手工

[`src/middleware/routeLimiters.ts`](</F:/Repositories/GitHub/Synapse/src/middleware/routeLimiters.ts:1>) 已实现共享内存存储，方向是对的；但当前问题是：

- 限流配置以代码常量散落
- 业务优先级没有统一分层
- 生产多实例下内存限流天然不一致
- 缺少对 429 的聚合指标与热点接口画像

### 2.5 启动阶段承担了业务迁移

[`src/app.ts`](</F:/Repositories/GitHub/Synapse/src/app.ts:1155>) 的 `migrateTtsCollection()` 在应用启动末尾直接执行。这个设计的主要问题：

- 启动和迁移耦合
- 失败重试策略不可控
- 扩容时可能多实例并发执行
- 迁移对启动耗时和风险有放大效应

## 3. 优化目标

### 3.1 一个月内达成

- 将启动文件拆分为可组合模块
- 建立清晰的 route registry
- 将存储初始化与迁移从业务存储类中剥离
- 建立最小可用指标体系
- 给核心接口补充回归测试

### 3.2 两到三个月内达成

- 建立统一配置校验与启动前检查
- 完成 Redis 化限流/缓存关键路径改造
- 将高成本任务从请求链路中异步化
- 降低 `app.ts` 和 `userStorage.ts` 的复杂度

### 3.3 量化指标

- 冷启动耗时下降 30% 以上
- `src/app.ts` 控制在 300 行以内
- P95 API 响应时间下降 20%
- 核心接口 5xx 降低 30%
- 至少 80% 核心鉴权/存储流程具备自动化测试

## 4. 总体方案

### 4.1 启动装配分层

建议把当前应用入口拆成下面几层：

1. `bootstrap/env.ts`
   负责 dotenv、时区、编码、进程级异常监听。
2. `bootstrap/config.ts`
   负责环境变量校验、默认值合并、启动失败前置。
3. `bootstrap/app.ts`
   只负责创建 express 实例。
4. `bootstrap/middleware.ts`
   只负责全局中间件顺序装配。
5. `bootstrap/routes.ts`
   只负责路由注册。
6. `bootstrap/services.ts`
   负责 ws、scheduler、db、runtime config 初始化。
7. `server.ts`
   只负责 `listen()`。

目标是把“创建 app”和“启动系统”分开，方便测试直接 import app，不再执行数据库和迁移副作用。

### 4.2 路由注册中心

把分散的 `app.use()` 改为注册表驱动。

示例结构：

```ts
export interface RouteModule {
  path: string;
  router: Router;
  middlewares?: RequestHandler[];
}
```

再由 `routes/index.ts` 统一导出：

- 路径
- 是否鉴权
- 是否需要限流
- 是否属于公开接口

收益：

- 新接口接入流程标准化
- 限流器和鉴权不再靠人工记忆
- 便于生成文档和检查遗漏

### 4.3 存储层重构

当前 `UserStorage` 建议拆为四层：

1. `userRepository`
   只管 CRUD 接口。
2. `userStorageProvider`
   分别实现 file/mongo/mysql provider。
3. `userBootstrapService`
   负责管理员初始化、建表、默认数据。
4. `userRepairService`
   负责修复、迁移、健康检查。

关键原则：

- 业务逻辑不感知底层存储模式
- 初始化与修复不进入普通读写路径
- 自动切换策略默认关闭，改为显式配置

原因是自动切换虽然“看起来智能”，但会让生产行为不可预测。

### 4.4 启动迁移下沉为运维任务

将 [`src/app.ts`](</F:/Repositories/GitHub/Synapse/src/app.ts:1155>) 的迁移逻辑迁出到 `scripts/migrations/`。

建议改造为：

- `npm run migrate:tts-user-datas`
- 支持 dry-run
- 支持幂等执行
- 支持锁机制，防止并发实例重复迁移
- 输出迁移报告

迁移不应在每次应用启动时自动尝试。

### 4.5 限流系统升级

保留当前 `SharedMemoryStore` 作为本地开发模式默认实现，但生产建议：

- 有 `REDIS_URL` 时自动切 Redis store
- 按接口类别定义统一速率等级
- 对登录、注册、TTS 生成、管理接口单独打指标
- 记录 429 命中数、命中 IP、接口维度热点

建议把限流等级抽象成配置表，而不是每个 limiter 单独手写。

## 5. 分领域优化建议

## 5.1 应用装配

问题：

- `app.ts` 里路由、启动、副作用混排
- 中间件顺序依赖强，但缺少模块边界

措施：

- 拆出 `registerCoreMiddleware(app)`
- 拆出 `registerSecurityMiddleware(app)`
- 拆出 `registerApiRoutes(app)`
- 拆出 `registerStaticRoutes(app)`
- 拆出 `registerErrorHandlers(app)`

收益：

- 中间件顺序可测试
- 路由冲突更易发现
- 入口文件可读性显著提升

## 5.2 配置系统

问题：

- 当前 `config.ts` 已有一定集中化，但仍混合静态配置与运行时配置
- 部分生产必填项靠运行期抛错

措施：

- 引入统一 schema 校验，例如 `zod`
- 启动前生成配置诊断报告
- 对 OpenAI、Redis、Mongo、MySQL、邮件等外部依赖做 readiness 校验
- 明确区分：
  - compile-time config
  - startup config
  - runtime mutable config

## 5.3 用户与鉴权链路

问题：

- 用户存储逻辑过于肥大
- 登录态、TOTP、Passkey、备份码等分散在多个模块

措施：

- 建立 `auth domain` 目录
- 切分 `authService`、`mfaService`、`passkeyService`、`sessionTokenService`
- 把用户信息结构版本化，避免字段持续堆叠
- 对登录、刷新、登出、MFA 校验建立统一审计事件模型

## 5.4 TTS 主链路

问题：

- TTS 是核心业务，但当前系统同时承担大量非 TTS 工具接口
- 核心能力与“工具箱式接口”共用一个单体入口，容易互相影响

措施：

- 将 TTS 相关能力抽成独立域模块：
  - `tts.controller.ts`
  - `tts.service.ts`
  - `tts.queue.ts`
  - `tts.storage.ts`
- 对音频生成采用作业化设计：
  - 提交任务
  - 查询状态
  - 拉取结果
- 对大文件和长耗时任务做异步化，避免同步占用请求线程

## 5.5 文件与静态资源

问题：

- 文件模式是重要 fallback，但本地 JSON 文件会放大并发写和损坏风险
- 音频目录、数据目录、日志目录由应用临时确保存在，职责偏散

措施：

- 所有文件写入统一通过原子写方案
- 引入临时文件 + rename 策略，避免半写入
- 文件存储增加版本号和校验字段
- 静态资源与 API 服务职责分离，生产优先交给 CDN/Nginx

## 5.6 日志与观测

问题：

- 当前更偏应用日志，缺少指标和追踪
- 缺少慢接口、错误类型、存储失败维度的聚合观察

措施：

- 引入结构化字段标准：
  - requestId
  - route
  - userId
  - ip
  - durationMs
  - storageMode
  - errorCode
- 增加 Prometheus 指标或等价统计：
  - 请求总量
  - 响应时间直方图
  - 429 次数
  - 5xx 次数
  - 外部 API 调用耗时
  - 队列长度
- 建立 `/health`、`/ready`、`/live` 分层探针

## 5.7 安全与中间件

问题：

- 中间件顺序虽然已有设计，但集中在单文件中，后续改动易误伤
- WAF、IP ban、tamper、防重放缺少统一策略层视角

措施：

- 抽象 `security pipeline`
- 为关键中间件建立顺序测试
- 明确哪些接口跳过哪些安全组件，并写入注册表
- 把安全例外从代码硬编码迁到白名单配置

## 6. 推荐实施顺序

### 第一阶段：低风险结构化

周期：1 周

- 拆分 `app.ts`
- 建立 route registry
- 统一路由命名和挂载方式
- 清理重复挂载和兼容路径注释
- 不改业务逻辑，只做结构重组

### 第二阶段：存储治理

周期：1 到 2 周

- 拆分 `UserStorage`
- 去除启动期自动迁移
- 把修复逻辑从请求路径移出
- 完成 file/mongo/mysql provider 接口统一

### 第三阶段：性能与稳定性

周期：1 到 2 周

- Redis 化限流
- 请求日志瘦身
- 高耗时接口异步化
- 文件存储原子写
- 补充关键缓存

### 第四阶段：可观测性与测试

周期：1 周

- 增加指标
- 完善健康探针
- 增加集成测试
- 建立回归基线

## 7. 优先级清单

### P0

- 拆分 `src/app.ts`
- 移除启动期自动迁移
- 拆分 `UserStorage`
- 建立启动前配置校验

### P1

- 生产限流迁移到 Redis
- 为核心链路补测试
- 文件存储原子写
- 增加指标和慢请求日志

### P2

- TTS 作业队列化
- 静态资源服务外移
- 统一错误码体系
- 配置中心化与热更新治理

## 8. 风险与注意事项

1. 当前系统接口面很宽，结构重组时最容易引入路由顺序回归。
2. `file` 存储模式是 fallback，不要在优化时默认忽略。
3. 管理员初始化、自动修复、迁移逻辑涉及数据安全，必须先补测试再拆。
4. 限流从内存改 Redis 后，压测数据会变化，需要重新校准阈值。
5. 若准备做异步队列，先确认前端是否接受“提交任务后轮询结果”的交互方式。

## 9. 建议输出物

为了让这份草案真正可执行，建议继续补四份配套产物：

1. 路由注册表设计稿
2. 存储层接口设计稿
3. 启动链路拆分 PR 计划
4. 核心接口压测与观测指标清单

## 10. 结论

当前后端的问题不是“某几个函数慢”，而是入口、存储、迁移、运维职责长期堆叠，已经开始影响维护成本和演进速度。最值得先做的不是局部微调，而是先把启动链路、路由装配和存储边界拆开；只要这三件事落地，后续性能优化、限流升级和 TTS 异步化都会顺很多。
