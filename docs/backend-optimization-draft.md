# Synapse 后端优化完整草案

## 1. 文档目的

本草案用于指导当前 Synapse 后端的下一阶段优化工作。目标不是重写后端，也不是脱离现状做理想化设计，而是基于当前代码结构，梳理真实问题、明确优先级，并给出可分阶段执行的落地方案。

本草案覆盖以下范围：

- 应用装配与启动链路
- 路由注册与安全管线
- 用户存储与鉴权相关基础设施
- TTS 主业务链路
- 限流、日志与可观测性
- 测试、交付与实施节奏

## 2. 当前代码现状

当前后端已经不是早期“单文件大入口”状态，部分结构化工作已经完成：

- 应用入口已经收敛到 [src/app.ts](</F:/Repositories/GitHub/Synapse/src/app.ts:1>)
- 应用装配逻辑集中在 [src/app/assembly.ts](</F:/Repositories/GitHub/Synapse/src/app/assembly.ts:1>)
- 启动副作用集中在 [src/app/startup.ts](</F:/Repositories/GitHub/Synapse/src/app/startup.ts:1>)
- 配置校验与运行时配置已经集中在 [src/config/config.ts](</F:/Repositories/GitHub/Synapse/src/config/config.ts:1>)
- 启动诊断已经集中在 [src/config/startupDiagnostics.ts](</F:/Repositories/GitHub/Synapse/src/config/startupDiagnostics.ts:1>)
- 路由注册表已经初步形成于 [src/routes/index.ts](</F:/Repositories/GitHub/Synapse/src/routes/index.ts:1>)
- 限流器已经具备 profile 化、指标聚合和 Redis 回退能力，见 [src/middleware/routeLimiters.ts](</F:/Repositories/GitHub/Synapse/src/middleware/routeLimiters.ts:1>)
- TTS 主链路已经拆为 controller、service、queue，见 [src/tts/tts.controller.ts](</F:/Repositories/GitHub/Synapse/src/tts/tts.controller.ts:1)、[src/tts/tts.service.ts](</F:/Repositories/GitHub/Synapse/src/tts/tts.service.ts:1)、[src/tts/tts.queue.ts](</F:/Repositories/GitHub/Synapse/src/tts/tts.queue.ts:1>)

这意味着当前优化工作的重点已经变化：

- 不是“先拆 `src/app.ts`”
- 而是“继续收缩新形成的耦合中心”

当前新的耦合中心主要有三个：

1. `src/app/assembly.ts`
2. `src/app/startup.ts`
3. `src/utils/userStorage.ts`

## 3. 当前主要问题判断

### 3.1 装配层已经拆分，但 `assembly.ts` 正在重新变重

[src/app/assembly.ts](</F:/Repositories/GitHub/Synapse/src/app/assembly.ts:1>) 目前承担了大量职责：

- 中间件注册
- 健康检查
- Swagger 装配
- 静态资源托管
- 前端回退页
- IP 查询与记录
- 兼容接口
- 根路径跳转
- 404 与 JSON parse 错误处理

这说明入口文件虽然拆了，但“复杂度”并未真正消失，只是从 `app.ts` 平移到了 `assembly.ts`。继续堆叠下去后，会重新回到难维护状态。

### 3.2 启动副作用仍然偏重

[src/app/startup.ts](</F:/Repositories/GitHub/Synapse/src/app/startup.ts:1>) 当前在 `listen()` 生命周期里串行处理：

- 目录创建
- 启动诊断
- 邮件服务配置探测
- 存储初始化
- Mongo 监听初始化
- 调度器启动
- 文件权限检查
- WebSocket 初始化

问题不在于这些事情不能做，而在于这些动作目前缺少更清晰的阶段模型：

- 哪些失败必须阻止启动
- 哪些失败允许降级运行
- 哪些失败只影响管理功能或外围功能

当前实现更多依赖日志和 `try/catch` 容忍，而不是明确的启动状态机。

### 3.3 `UserStorage` 是当前最大的结构性技术债

[src/utils/userStorage.ts](</F:/Repositories/GitHub/Synapse/src/utils/userStorage.ts:1>) 同时承担了过多职责：

- 输入清洗与校验
- 文件存储读写
- Mongo 访问
- MySQL 访问
- 初始化默认管理员
- 文件修复与自愈
- 自动重试
- 自动切换存储模式
- 认证相关规则
- 使用量统计

这已经不是一个单纯的 storage 类，而是“用户域基础设施总包”。这类文件的风险在于：

- 一个局部修复可能影响多个存储模式
- 很难补齐针对性测试
- 失败边界不清
- 生产行为可能因为 fallback 变得不可预测

### 3.4 路由注册表已存在，但治理还没闭环

[src/routes/index.ts](</F:/Repositories/GitHub/Synapse/src/routes/index.ts:1>) 已经是正确方向，统一记录了：

- path
- middlewares
- requiresAuth
- rateLimited
- isPublic
- securityBypass

但目前它更像“挂载清单”，还不是完整治理中心。缺的能力包括：

- metadata 与实际中间件一致性检查
- 路由级策略审计
- 自动发现遗漏的限流和鉴权配置
- 为测试和文档生成提供稳定数据源

### 3.5 TTS 已队列化，但仍停留在单进程可用阶段

[src/tts/tts.queue.ts](</F:/Repositories/GitHub/Synapse/src/tts/tts.queue.ts:1>) 已经实现了队列化处理，这比同步接口直接生成更合理。但当前仍有明显边界：

- 队列处理是单进程内存模型
- 重启后任务状态恢复能力不足
- 多实例部署下无法共享队列
- 失败重试与死信策略缺失
- 上游 OpenAI 调用缺少统一超时、退避和熔断模型

这意味着当前 TTS 任务系统是“功能可用”，但还不是“生产级任务系统”。

### 3.6 限流器已改善，但缺乏外部观测出口

[src/middleware/routeLimiters.ts](</F:/Repositories/GitHub/Synapse/src/middleware/routeLimiters.ts:1>) 已经具备：

- profile 化定义
- category 分类
- SharedMemoryStore
- RedisBackedStore
- 429 聚合指标

但问题是这些能力主要停留在进程内和日志里：

- 热点路由与热点 IP 没有统一暴露出口
- 管理面没有稳定读取方式
- 没有与 `/health`、admin metrics、Prometheus 等观测面打通

### 3.7 部分业务型 handler 仍混在装配层

当前 `assembly.ts` 中仍包含一些业务型路由逻辑，例如：

- `/ip`
- `/ip-location`
- `/api/report-ip`
- `/server_status`

这些接口不应长期留在装配层。它们应该回到 controller/service 层，否则装配层会持续变成“临时业务落点”。

## 4. 优化目标

## 4.1 一个月目标

- 让装配层职责再次收口
- 把 `UserStorage` 从超大混合体拆成可维护模块
- 为启动阶段建立明确的“必须成功”和“允许降级”边界
- 为 TTS 任务链路补齐持久化和观测基础
- 为限流和健康检查提供统一可见性

## 4.2 两到三个月目标

- 形成可持续扩展的 route registry 治理模型
- 形成 provider 化用户存储架构
- 让 TTS 队列支持多实例或可恢复部署
- 建立稳定的 metrics、readiness、slow-path 观测体系
- 提升核心链路自动化测试覆盖

## 4.3 量化目标

- `src/app/assembly.ts` 体量下降 30% 以上
- `src/utils/userStorage.ts` 被拆为至少 4 个职责明确的模块
- TTS 任务可在服务重启后继续查询状态
- 429、5xx、OpenAI 上游失败、TTS 任务耗时可被统一观测
- 登录、注册、TTS 提交、TTS 查询、启动诊断、限流命中等核心流程具备自动化回归测试

## 5. 总体优化策略

本次优化遵循四个原则：

1. 不推翻现有结构，沿现有拆分方向继续收口。
2. 优先处理结构性耦合，而不是先做局部微优化。
3. 先澄清边界与失败模型，再做性能和扩展。
4. 所有优化要能映射到当前代码文件，而不是抽象口号。

## 6. 分领域优化方案

### 6.1 应用装配层优化

目标：把 [src/app/assembly.ts](</F:/Repositories/GitHub/Synapse/src/app/assembly.ts:1>) 从“综合装配文件”进一步收敛为“纯装配协调层”。

建议拆分为以下模块：

- `app/registerCoreMiddleware.ts`
- `app/registerSecurityMiddleware.ts`
- `app/registerApiRoutes.ts`
- `app/registerDocsAndStatic.ts`
- `app/registerFallbackRoutes.ts`

同步调整原则：

- 装配层不再直接承载复杂业务 handler
- 业务型 endpoint 回归 controller/service
- Swagger、frontend fallback、favicon、status 这类横切逻辑集中管理

预期收益：

- 装配层职责更清晰
- 路由冲突更容易定位
- 中间件顺序测试更容易写

### 6.2 启动链路优化

目标：把 [src/app/startup.ts](</F:/Repositories/GitHub/Synapse/src/app/startup.ts:1>) 从“副作用集合”改造成“初始化阶段编排器”。

建议拆出以下初始化任务：

- `startup/ensureDirectories.ts`
- `startup/runDiagnostics.ts`
- `startup/initializeStorage.ts`
- `startup/configureEmailServices.ts`
- `startup/startSchedulers.ts`
- `startup/initializeRealtime.ts`

同时引入初始化结果模型：

- required: 失败直接阻止启动
- degradable: 失败后标记为降级运行
- optional: 失败只记录告警

建议映射关系：

- OpenAI readiness: required
- 当前存储模式连接初始化: required
- Redis readiness: degradable
- 邮件服务可用性: degradable
- 调度器启动: optional 或 degradable

预期收益：

- 启动失败原因更明确
- 运维判断更直观
- `health/ready/live` 分层探针更容易建立

### 6.3 用户存储重构

目标：逐步拆分 [src/utils/userStorage.ts](</F:/Repositories/GitHub/Synapse/src/utils/userStorage.ts:1>)，让用户域逻辑、存储实现、初始化修复逻辑分层。

建议拆成四层：

1. `user/userValidationService.ts`
2. `user/userRepository.ts`
3. `user/providers/fileUserProvider.ts`
4. `user/providers/mongoUserProvider.ts`
5. `user/providers/mysqlUserProvider.ts`
6. `user/userBootstrapService.ts`
7. `user/userRepairService.ts`

说明：

- `userRepository` 对上提供统一接口
- provider 只负责底层 CRUD
- bootstrap 负责默认管理员、建表、初始化
- repair 负责文件修复、自愈、迁移
- 输入校验不再塞进 storage provider

重点治理项：

- 降低自动 fallback 行为
- 将“自动切换存储模式”改为显式策略
- 将同步文件 I/O 进一步收敛到有限边界

预期收益：

- 每种存储模式可以单独测试
- 用户认证逻辑不再依赖超大工具类
- 线上问题更容易隔离到具体 provider

### 6.4 路由注册表治理升级

目标：让 [src/routes/index.ts](</F:/Repositories/GitHub/Synapse/src/routes/index.ts:1>) 从“挂载清单”升级为“路由治理中心”。

建议新增能力：

- route metadata 校验器
- 安全策略一致性测试
- 限流缺失扫描
- auth requirement 一致性检查
- 文档生成可消费结构

建议最小校验规则：

- `requiresAuth = true` 的模块必须显式挂鉴权中间件
- `rateLimited = true` 的模块必须存在 limiter 或 mount limiter
- `securityBypass` 必须有注释和原因
- `isPublic = false` 的模块不能落入开放 CORS 例外

预期收益：

- 新增路由不再只靠人工记忆
- 安全回归更容易被测试捕捉
- 结构治理从“约定”变成“可校验”

### 6.5 TTS 主链路优化

目标：在保留现有 controller/service/queue 分层的前提下，将 TTS 从“可用型任务链路”提升为“可恢复型任务链路”。

当前关键文件：

- [src/tts/tts.controller.ts](</F:/Repositories/GitHub/Synapse/src/tts/tts.controller.ts:1>)
- [src/tts/tts.service.ts](</F:/Repositories/GitHub/Synapse/src/tts/tts.service.ts:1>)
- [src/tts/tts.queue.ts](</F:/Repositories/GitHub/Synapse/src/tts/tts.queue.ts:1>)

建议优化方向：

- 将任务状态存储持久化到 Redis 或数据库
- 为任务增加重试次数、最后错误、开始时间、完成时间
- 为 OpenAI 调用增加 timeout、retry、backoff、错误映射
- 将提交校验链路抽为 `ttsSubmissionService`
- 将重复内容检测、验证码校验、内容检测等从 controller 中下沉

建议任务生命周期标准化：

- queued
- processing
- completed
- failed
- expired

进一步目标：

- 支持服务重启后任务状态恢复
- 支持将来切换到独立 worker
- 支持管理端查看队列和失败任务

### 6.6 限流与观测

目标：在现有 [src/middleware/routeLimiters.ts](</F:/Repositories/GitHub/Synapse/src/middleware/routeLimiters.ts:1>) 基础上补齐观测出口。

建议保留现有 profile 化设计，并新增：

- `admin/rate-limit-metrics` 查询接口
- 将 `getRateLimitMetricsSnapshot()` 接入监控端点
- 记录每类 limiter 命中次数和热点接口
- 区分 429 高频误伤和真实攻击流量

建议核心指标最少包括：

- request_total
- request_duration_ms
- response_5xx_total
- response_429_total
- openai_request_total
- openai_failure_total
- tts_job_queued_total
- tts_job_failed_total
- tts_job_duration_ms

建议日志字段统一为：

- requestId
- route
- method
- userId
- ip
- storageMode
- durationMs
- upstream
- errorCode

### 6.7 健康检查与运行状态

目标：将当前 `/health` 从综合状态接口扩展为分层探针体系。

建议新增：

- `/live`: 进程是否存活
- `/ready`: 是否具备对外服务能力
- `/health`: 综合状态详情

判定原则：

- `live` 不依赖 Mongo/Redis/OpenAI
- `ready` 依赖当前 storage mode 与必要外部依赖
- `health` 返回详细组件状态与降级信息

这可以直接复用 [src/config/startupDiagnostics.ts](</F:/Repositories/GitHub/Synapse/src/config/startupDiagnostics.ts:1>) 的诊断数据，而不需要重新造一套模型。

### 6.8 业务型接口回归控制器

目标：清理 `assembly.ts` 中直接实现业务逻辑的临时接口。

优先迁移目标：

- `/ip`
- `/ip-location`
- `/api/report-ip`
- `/api/report-docs-timeout`
- `/server_status`

建议方式：

- 建立 `systemController` 或按领域拆分 controller
- 业务逻辑统一进入 service
- 装配层只负责挂载和中间件顺序

## 7. 推荐实施顺序

### 第一阶段：结构收口

周期：1 周

目标：

- 进一步拆分 `assembly.ts`
- 迁移装配层中的业务型 handler
- 保持功能不变，只收口边界

交付物：

- 新的装配层文件结构
- 路由挂载保持兼容
- 相关回归测试

### 第二阶段：用户存储治理

周期：1 到 2 周

目标：

- 拆分 `UserStorage`
- 建立 provider 化接口
- 将 bootstrap 和 repair 从 CRUD 路径中分离

交付物：

- 用户存储接口草图与实现
- file/mongo/mysql provider
- 初始化和修复服务

### 第三阶段：启动链路与健康检查

周期：1 周

目标：

- 重构 `startup.ts`
- 建立 required/degradable/optional 初始化模型
- 增加 `/ready` 和 `/live`

交付物：

- 启动阶段任务清单
- 分层健康检查接口
- 启动失败判定规则

### 第四阶段：TTS 任务系统增强

周期：1 到 2 周

目标：

- 任务状态持久化
- 失败重试基础能力
- OpenAI 调用治理
- 补齐队列观测

交付物：

- 持久化任务存储
- TTS 任务状态模型
- 失败任务查询和审计基础

### 第五阶段：限流与观测完善

周期：1 周

目标：

- 暴露 rate limit metrics
- 增加核心链路 metrics
- 建立慢路径和错误聚合视图

交付物：

- 限流指标接口
- 统一指标命名
- 请求级结构化日志规范

## 8. 优先级清单

### P0

- 拆分 `src/app/assembly.ts`
- 拆分 `src/utils/userStorage.ts`
- 重构 `src/app/startup.ts` 初始化边界
- 为 TTS 任务引入可恢复状态存储

### P1

- 建立 route registry 一致性校验
- 建立 `/live`、`/ready`、`/health`
- 为 OpenAI/TTS 增加超时、重试与错误治理
- 为限流与任务链路暴露 metrics

### P2

- 为多实例部署准备共享队列
- 将更多兼容接口迁出装配层
- 完整统一错误码模型
- 为 admin 增加运行状态面板

## 9. 风险与注意事项

1. `UserStorage` 拆分时，最容易引入 file/mongo/mysql 行为不一致，必须先围绕现有行为补测试。
2. 启动链路改造时，不要把“可降级”错误误判成“必须中止”，否则会造成部署可用性下降。
3. TTS 任务持久化后，前端轮询协议要保持兼容，避免接口语义漂移。
4. 路由注册表治理需要结合现有测试，不要只引入 metadata 而不做一致性断言。
5. 限流 metrics 若直接暴露到公开接口，需要注意权限和敏感信息脱敏。

## 10. 配套输出物建议

为了让本草案能真正进入执行阶段，建议同步产出以下配套文档：

1. `docs/backend-route-registry-spec.md`
2. `docs/backend-user-storage-refactor-spec.md`
3. `docs/backend-startup-lifecycle-spec.md`
4. `docs/backend-tts-job-system-spec.md`
5. `docs/backend-observability-metrics-spec.md`

## 11. 结论

当前 Synapse 后端已经完成了第一轮入口拆分，优化重点不再是重复强调“拆 `app.ts`”，而是继续消化新阶段形成的耦合中心。真正决定后续维护成本和扩展能力的，是以下四件事：

1. 收缩 `assembly.ts`
2. 拆分 `UserStorage`
3. 治理 `startup.ts` 的副作用边界
4. 将 TTS 队列从单进程可用模型推进到可恢复模型

只要这四项落地，后续的性能优化、可观测性建设和多实例扩展都会顺很多。这也是当前代码状态下最实际、最可执行的后端优化路径。
