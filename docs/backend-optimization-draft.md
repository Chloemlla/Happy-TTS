# Synapse 后端优化完整草案

## 1. 文档目标

这份草案用于指导 Synapse 后端下一阶段优化工作，目标不是推翻现有实现，而是在当前代码基础上做结构收口、可靠性增强和运行治理补齐。

本文聚焦后端真实现状，覆盖以下范围：

- 应用装配与启动链路
- TTS 主业务链路
- 任务队列与持久化
- 配置、存储与依赖治理
- 安全、限流与可观测性
- 测试、发布与实施节奏

## 2. 当前后端现状

### 2.1 已完成的结构化工作

当前仓库已经完成了一轮重要重构，不能再按早期“大一统单文件后端”来判断：

- 入口已收敛到 [src/app.ts](/F:/Repositories/GitHub/Synapse/src/app.ts:1)
- 应用装配已集中到 [src/app/assembly.ts](/F:/Repositories/GitHub/Synapse/src/app/assembly.ts:1)
- 启动副作用已集中到 [src/app/startup.ts](/F:/Repositories/GitHub/Synapse/src/app/startup.ts:1)
- 配置解析与约束已集中到 [src/config/config.ts](/F:/Repositories/GitHub/Synapse/src/config/config.ts:1)
- 路由注册已经做成模块清单，位于 [src/routes/index.ts](/F:/Repositories/GitHub/Synapse/src/routes/index.ts:1)
- 用户存储已不是单一巨型类，而是 facade + repository/provider 结构，且当前已收敛为 Mongo-only，见 [src/utils/userStorage.ts](/F:/Repositories/GitHub/Synapse/src/utils/userStorage.ts:1)、[src/utils/userRepository.ts](/F:/Repositories/GitHub/Synapse/src/utils/userRepository.ts:1)、[src/utils/providers/mongoUserStorageProvider.ts](/F:/Repositories/GitHub/Synapse/src/utils/providers/mongoUserStorageProvider.ts:1)
- TTS 主链路已经迁移到独立命名空间，见 [src/tts/tts.controller.ts](/F:/Repositories/GitHub/Synapse/src/tts/tts.controller.ts:1)、[src/tts/tts.pipeline.ts](/F:/Repositories/GitHub/Synapse/src/tts/tts.pipeline.ts:1)、[src/tts/tts.queue.ts](/F:/Repositories/GitHub/Synapse/src/tts/tts.queue.ts:1)、[src/tts/tts.storage.ts](/F:/Repositories/GitHub/Synapse/src/tts/tts.storage.ts:1)

这意味着当前优化重点已经变化。

现在不是优先讨论“怎么拆 `app.ts`”或“怎么把 `UserStorage` 拆开”，而是要处理新结构下已经形成的真实瓶颈。

### 2.2 当前后端的真实重心

结合代码现状，当前后端的核心重心主要有四个：

1. `assembly.ts` 仍承担过多非装配职责。
2. TTS 提交校验和队列处理已经可用，但还没到生产级稳态。
3. 任务持久化和依赖降级逻辑具备雏形，但观测和一致性不足。
4. 路由注册、限流、健康检查已结构化，但还没有形成治理闭环。

## 3. 现状判断与主要问题

## 3.1 装配层已经拆分，但 `assembly.ts` 再次变重

[src/app/assembly.ts](/F:/Repositories/GitHub/Synapse/src/app/assembly.ts:1) 当前不仅负责挂载中间件和路由，还直接承载了大量业务型或运维型逻辑，例如：

- `/api/ip`
- `/api/ip-location`
- `/api/report-ip`
- `/api/report-docs-timeout`
- `/api/server_status`
- Swagger JSON 读取与 UI 装配
- docs/frontend 静态资源与 fallback 逻辑

这类文件的问题不是“代码能不能跑”，而是职责边界已经再次模糊。继续往这里加接口，最终会把装配层重新堆回新的“大入口文件”。

结论：

- `assembly.ts` 现在的风险不是体积本身，而是职责泄漏。
- 它应该继续往“纯装配协调层”收敛，而不是继续成为临时业务落点。

## 3.2 启动链路已经集中，但缺少明确的 readiness 分层

[src/app/startup.ts](/F:/Repositories/GitHub/Synapse/src/app/startup.ts:1) 已经把很多副作用集中起来了，这一步是对的。但现在仍然存在一个问题：

- 初始化动作很多
- 大部分错误用日志和 `try/catch` 表达
- 哪些失败会影响对外服务，哪些只是降级，边界还不够清楚

例如：

- 用户存储初始化失败是否允许服务继续暴露？
- Redis 不可用时是仅影响 IP Ban，还是也影响后续限流与任务能力？
- OpenAI 配置异常目前更像运行时失败，而不是启动期 readiness 信号

当前 `/health` 已经有基础信息，但还不够区分 `live`、`ready`、`degraded` 三种状态。

## 3.3 用户存储主债务已经下降，但“行为一致性”仍是风险点

旧判断里把 `UserStorage` 作为“最大结构性技术债”已经不完全准确，因为当前 [src/utils/userStorage.ts](/F:/Repositories/GitHub/Synapse/src/utils/userStorage.ts:1) 实际上已经是 facade，底层职责已拆给：

- `userRepository`
- `userBootstrapService`
- `userRepairService`
- `providers/mongoUserStorageProvider`

真正的风险已经从“单文件过大”变成了“Mongo-only 契约是否清晰、是否有回归测试”：

- Mongo provider 的返回语义是否稳定
- usage 统计、admin bootstrap、账号状态处理是否有测试兜底
- repair/auto-fix 是否只做健康检查，不再隐式切换存储
- 生产环境下 Mongo 不可用时是否明确失败，而不是静默 fallback

因此这一块的优化重点不该再是“继续机械拆文件”，而是：

- 明确 Mongo-only provider 契约
- 为关键行为补回归测试
- 收紧自动修复边界

## 3.4 TTS 主链路已经成型，但存在三个明显短板

### 3.4.1 提交校验链路串行过长

[src/tts/tts.pipeline.ts](/F:/Repositories/GitHub/Synapse/src/tts/tts.pipeline.ts:1) 当前在一次提交中串行处理：

- 文本长度校验
- 本地违禁词检测
- 外部违禁词检测
- 生成码校验
- Turnstile 校验
- 用户剩余额度检查
- 重复内容检查

这些动作本身合理，但当前问题是：

- 对外部依赖过于敏感
- 错误语义偏混合
- 某些环节失败会直接使提交不可用
- 提交耗时会随着外部校验链路线性增加

其中最明显的是远端违禁词检测 `https://v2.xxapi.cn/api/detect`。这一依赖一旦抖动，会直接让 TTS 提交变成 500/重试型错误。

### 3.4.2 队列已经持久化，但仍属于“轻量任务系统”

[src/tts/tts.storage.ts](/F:/Repositories/GitHub/Synapse/src/tts/tts.storage.ts:1) 已经支持：

- Mongo 任务持久化
- 作业 claim
- stale job recover
- 配额 reservation、生成历史和音频资产持久化由 `tts.quota.ts`、`tts.history.ts`、`tts.asset.ts` 补齐

这说明当前不再是纯内存队列，这一点比旧稿判断更成熟。

但它仍然有明显上限：

- 只有单 worker drain 模型
- 缺少显式 dead-letter 机制
- 缺少最大重试策略
- 没有任务过期清理策略
- 缺少队列深度、失败率、处理时长监控
- 对多实例部署支持仍偏弱

因此它适合“单服务节点 + 可恢复”场景，但还不适合“多节点 + 高吞吐 + 强治理”场景。

### 3.4.3 生成服务已做超时重试和熔断，但幂等和缓存策略还不完整

[src/tts/tts.service.ts](/F:/Repositories/GitHub/Synapse/src/tts/tts.service.ts:1) 已经具备：

- OpenAI 调用超时
- retry
- circuit breaker
- 重复内容 hash 命中
- 本地文件与资产恢复

这是当前后端里相对成熟的一块。

但还存在几个问题：

- 内容 hash 未包含 `speed` 和输出格式策略，幂等粒度未完全对齐业务语义
- 重复生成处罚逻辑和复用逻辑耦合，容易影响用户体验
- 熔断状态是进程内静态状态，多实例间不共享
- 上游错误虽然做了映射，但缺少统一统计出口

## 3.5 路由治理已有基础，但还停留在“清单化”

[src/routes/index.ts](/F:/Repositories/GitHub/Synapse/src/routes/index.ts:1) 现在已经维护了：

- `requiresAuth`
- `rateLimited`
- `isPublic`
- `securityBypass`

这非常重要，说明代码库已经在往 route registry 治理走。

但目前 registry 的问题是：

- metadata 没有自动一致性校验
- 很多属性仍依赖人工自觉维护
- 它还没有反向驱动测试、审计和监控

换句话说，当前 registry 更像“结构化清单”，还不是“治理源”。

## 3.6 限流器已不错，但观测出口仍偏弱

从 `src/routes/index.ts` 与 `src/middleware/routeLimiters.ts` 的挂载方式看，限流体系已经比较系统。

但目前仍缺少几项关键能力：

- 热点 limiter 命中排行
- 429 分布按 route / IP / user 分类
- 管理接口或 metrics 接口统一暴露
- 与 TTS 任务指标联动

当前更像“限流已经在工作”，但还不够“限流可运营、可调优”。

## 3.7 Redis 已接入，但还没形成统一基础能力层

[src/services/redisService.ts](/F:/Repositories/GitHub/Synapse/src/services/redisService.ts:1) 当前主要用于 IP Ban，一些更上层的能力还没借上：

- TTS 任务队列共享状态
- 分布式熔断/限流状态
- 统一短期缓存
- 运行时状态广播

如果后续确实要做多实例或更强任务治理，Redis 不应长期只作为“IP Ban 附件”存在。

## 4. 优化目标

### 4.1 一个月目标

- 让装配层重新收口到“只做装配”
- 为 TTS 提交流程建立更清晰的失败分级
- 为 TTS 队列补齐重试、过期、清理和观测能力
- 建立 `/live`、`/ready`、`/health` 分层探针
- 补足 Mongo provider 契约测试和关键链路测试

### 4.2 两到三个月目标

- 将 TTS 任务系统升级为可治理的持久化任务系统
- 让 route registry 成为校验与审计数据源
- 形成统一 metrics 与结构化日志规范
- 让 Redis 成为可选的共享基础设施层

### 4.3 量化目标

- `assembly.ts` 体量和职责至少下沉 30%
- TTS 提交平均耗时下降，外部内容检测失败不再直接拖垮主流程
- TTS 任务具备最大重试、过期与失败审计
- 核心链路具备请求级 `requestId`、耗时与错误码统计
- 核心 provider 行为具备自动化一致性验证

## 5. 总体优化原则

1. 不重复做已经做过的拆分。
2. 先治理失败边界，再谈更大规模重构。
3. 优先解决会影响生产稳定性的链路。
4. 所有优化要能映射到当前文件和当前部署方式。

## 6. 分领域优化方案

## 6.1 装配层优化

目标：让 [src/app/assembly.ts](/F:/Repositories/GitHub/Synapse/src/app/assembly.ts:1) 回到纯装配角色。

建议拆分方向：

- `app/registerCoreMiddleware.ts`
- `app/registerSecurityMiddleware.ts`
- `app/registerApiRoutes.ts`
- `app/registerDocsRoutes.ts`
- `app/registerFrontendRoutes.ts`
- `app/registerOperationalRoutes.ts`

其中业务型或运维型接口迁移方向建议为：

- `/api/ip`、`/api/ip-location` 迁入 `networkController/networkService`
- `/api/report-ip`、`/api/report-docs-timeout` 迁入 `analyticsController/analyticsService`
- `/api/server_status` 迁入 `adminController` 或 `statusController`

预期收益：

- 中间件顺序更清楚
- 业务逻辑不再混在启动装配层
- 未来新增接口不容易继续堆到 `assembly.ts`

## 6.2 启动链路与健康探针优化

目标：基于 [src/app/startup.ts](/F:/Repositories/GitHub/Synapse/src/app/startup.ts:1) 建立明确的初始化阶段模型。

建议将初始化任务分为三类：

- required: 失败后服务不应进入 ready
- degradable: 失败后服务可以启动，但应标记 degraded
- optional: 失败仅记录告警

推荐划分：

- required
  - 当前用户存储模式初始化
  - JWT/管理员配置校验
  - 核心目录可写性
- degradable
  - Redis
  - 邮件服务
  - OpenAI 上游可达性探测
- optional
  - 调度器
  - 文档资源
  - 额外诊断脚本

建议新增接口：

- `/live`
- `/ready`
- `/health`

接口含义：

- `/live`: 只表示进程活着
- `/ready`: 只表示具备对外服务能力
- `/health`: 返回组件级详情与降级信息

## 6.3 用户存储治理优化

目标：不再继续机械拆文件，而是提高 Mongo-only 行为契约的可验证性。

建议工作：

- 统一 Mongo provider 契约文档
- 抽出 Mongo provider contract tests
- 明确哪些行为允许 auto-fix，哪些必须显式报错
- 明确 usage、admin bootstrap、账号状态处理语义

建议新增测试维度：

- `createUser/getUserById/updateUser/deleteUser` 的 Mongo provider 行为
- `authenticateUser`、旧密码迁移和密码材料选择逻辑
- `getRemainingUsage/incrementUsage` 一致
- repair/auto-fix 在生产模式下行为受控，且不会切换到其他存储

这一阶段的重点不是继续重命名，而是把“拆开的模块真正治理起来”。

## 6.4 TTS 提交流程优化

目标：降低 [src/tts/tts.pipeline.ts](/F:/Repositories/GitHub/Synapse/src/tts/tts.pipeline.ts:1) 的外部依赖耦合和串行耗时。

建议改造方向：

### 6.4.1 引入校验分层

将提交校验分为三层：

- 本地同步校验
  - 参数格式
  - 文本长度
  - 模型/voice/outputFormat 合法值
- 本地策略校验
  - 额度
  - 重复提交
  - 生成码
  - 账号状态
- 外部依赖校验
  - Turnstile
  - 远端违禁词检测

这样做的目的是把“用户输入有问题”和“外部服务暂时不可用”严格区分开。

### 6.4.2 弱化远端违禁词依赖的阻断程度

当前远端违禁词服务不可用会直接中断提交，这对可用性影响很大。

建议改成可配置策略：

- `strict`: 远端检测失败即阻断
- `degraded`: 远端检测失败时仅保留本地过滤并记录风险日志

默认建议：

- 生产环境可配置
- 默认 `degraded`
- 高风险部署再切 `strict`

### 6.4.3 提前缓存生成码与配置型依赖

`GENERATION_CODE` 当前通过 Mongo 配置读取，可以增加本地短期缓存和版本刷新，避免每次提交都走一次配置读取链路。

## 6.5 TTS 任务队列与持久化优化

目标：把当前“轻量可恢复队列”升级为“可治理任务系统”。

建议基于 [src/tts/tts.storage.ts](/F:/Repositories/GitHub/Synapse/src/tts/tts.storage.ts:1) 继续增强：

### 6.5.1 标准化任务状态

建议状态扩展为：

- `queued`
- `processing`
- `completed`
- `failed`
- `expired`
- `dead_letter`

### 6.5.2 增加任务治理字段

建议新增字段：

- `startedAt`
- `completedAt`
- `failedAt`
- `maxAttempts`
- `lastErrorCode`
- `lastErrorMessage`
- `expiresAt`
- `deadLetterReason`

### 6.5.3 明确重试策略

当前已有 `attempts`，但缺少完整策略。

建议：

- retryable 错误进入指数退避
- non-retryable 直接失败
- 超过 `maxAttempts` 进入 `dead_letter`

### 6.5.4 增加清理任务

建议周期清理：

- 过期 completed job
- 过期 failed job
- 长时间无人查询的 job result

### 6.5.5 为多实例预留升级路径

当前可先不立即切换独立队列系统，但建议保留两步升级路径：

1. 当前 Mongo/文件方案补齐治理能力
2. 若后续吞吐增长，再迁到 Redis/BullMQ 或独立 worker

## 6.6 TTS 生成服务优化

目标：在保留 [src/tts/tts.service.ts](/F:/Repositories/GitHub/Synapse/src/tts/tts.service.ts:1) 现有优点的前提下，补齐语义一致性。

建议项：

- content hash 纳入 `speed`
- 明确输出格式是否参与幂等键
- 将“重复命中后记违规”改为独立策略配置
- 为熔断器增加状态导出
- 将上游调用结果纳入统一 metrics

这里需要特别注意一个产品语义问题：

“重复内容复用缓存”与“恶意重复提交惩罚”不应强绑定。前者是节省成本，后者是风控策略。两者绑在一起，后续非常容易误伤正常用户。

## 6.7 可观测性优化

目标：让当前后端从“有日志”升级到“可运营”。

建议最少补齐以下指标：

- `http_requests_total`
- `http_request_duration_ms`
- `http_5xx_total`
- `http_429_total`
- `tts_submit_total`
- `tts_submit_rejected_total`
- `tts_job_queued_total`
- `tts_job_processing_total`
- `tts_job_failed_total`
- `tts_job_duration_ms`
- `tts_openai_requests_total`
- `tts_openai_failures_total`
- `tts_circuit_state`

建议统一日志字段：

- `requestId`
- `route`
- `method`
- `userId`
- `ip`
- `storageMode`
- `jobId`
- `durationMs`
- `errorCode`
- `upstream`

建议暴露方式至少二选一：

- 管理接口 JSON 输出
- Prometheus 风格 `/metrics`

## 6.8 路由治理闭环

目标：让 [src/routes/index.ts](/F:/Repositories/GitHub/Synapse/src/routes/index.ts:1) 成为真正的治理源。

建议新增自动校验：

- `requiresAuth = true` 的模块必须显式携带鉴权链路
- `rateLimited = true` 的模块必须存在 mount limiter 或 route limiter
- `securityBypass` 必须带原因说明
- `isPublic = false` 的模块不能落入开放 CORS 例外

建议新增用途：

- 自动生成路由审计清单
- 自动验证安全策略
- 自动生成内部运维文档

## 6.9 Redis 能力升级

目标：让 Redis 从单点功能附件升级为可选基础设施层。

建议后续优先承载：

- TTS 短期结果缓存
- 分布式任务锁或共享队列
- 熔断状态共享
- 高频配置缓存

这一步不是必须立刻做，但要在方案上预留，避免未来重复推翻现有任务系统。

## 7. 推荐实施顺序

### 第一阶段：装配层和探针收口

周期：1 周

目标：

- 把业务型接口迁出 `assembly.ts`
- 建立 `/live`、`/ready`、`/health`
- 明确 required/degraded/optional 初始化结果

### 第二阶段：TTS 提交流程治理

周期：1 周

目标：

- 校验链路分层
- 外部违禁词依赖降级策略
- 生成码和配置型依赖缓存

### 第三阶段：TTS 任务系统增强

周期：1 到 2 周

目标：

- 补齐任务状态字段
- 增加最大重试和 dead-letter
- 增加任务清理与观测

### 第四阶段：Mongo provider 与回归测试

周期：1 周

目标：

- 补齐 Mongo provider 契约测试
- 补齐 TTS 提交与查询链路测试
- 补齐启动链路与健康探针测试

### 第五阶段：指标与治理闭环

周期：1 周

目标：

- 暴露 metrics
- 增加 route registry 校验
- 打通限流、任务和上游依赖观测

## 8. 优先级清单

### P0

- 收口 `assembly.ts`
- 建立 readiness 分层
- 优化 TTS 提交校验失败模型
- 为 TTS 任务增加完整重试/过期/失败治理

### P1

- Mongo provider 契约测试
- route registry 自动校验
- TTS/OpenAI 指标暴露
- Redis 能力抽象预留

### P2

- 多实例共享任务模型
- 熔断状态共享
- 管理端运行态面板

## 9. 风险与注意事项

1. 不要按旧认知重复拆已经拆开的模块，否则只会制造噪音。
2. TTS 提交流程改造时，必须保证前端轮询协议和返回结构兼容。
3. 外部违禁词服务降级后，要同步增加风险日志和审计，避免“可用性提升但失去风控证据”。
4. 任务系统增强时，要先明确清理策略，否则持久化作业会持续膨胀。
5. Mongo provider 契约测试必须先行，否则存储层优化很容易引入行为漂移。

## 10. 建议配套文档

建议在这份总草案基础上继续产出以下专项文档：

1. `docs/backend-tts-job-system-spec.md`
2. `docs/backend-readiness-health-spec.md`
3. `docs/backend-route-governance-spec.md`
4. `docs/backend-mongo-persistence-detail.md`
5. `docs/backend-user-storage-contract-spec.md`
6. `docs/backend-observability-spec.md`

## 11. 结论

当前 Synapse 后端已经完成了第一轮重要重构，旧的“先拆入口、先拆 UserStorage”的思路已经不再是主战场。当前最值得投入的方向是：

1. 继续收口 `assembly.ts` 的职责
2. 把 TTS 提交流程从“功能可用”推进到“故障边界清晰”
3. 把 TTS 任务系统从“轻量可恢复”推进到“可治理”
4. 把 route registry、限流、健康检查和 metrics 串成真正的治理闭环

如果这四件事落地，Synapse 后端的维护成本、可靠性和后续扩展能力都会明显改善。这也是最符合当前代码现状的优化路线。
