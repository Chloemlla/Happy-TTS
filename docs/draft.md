- Critical 核心用户认证仍是明文密码链路，不是 bcrypt。注册时原始密码直接进入用户对象并被持久化，src/controllers/
  authController.ts:247、src/utils/userRepository.ts:78、src/utils/providers/fileUserStorageProvider.ts:84、src/utils/providers/
  mysqlUserStorageProvider.ts:125、src/services/userService.ts:154。登录校验也是字符串直接比较，src/utils/userRepository.ts:87、
  src/utils/userValidationService.ts:142。这不是“可优化项”，而是应优先修复的安全缺陷。
- High preParserRouteModules 的挂载位置让部分入口绕过统一安全栈。registerCoreMiddleware 先挂了这些路由，src/app/assembly.ts:288；而
  ip ban / audit log / WAF 是后面才注册的，src/app/assembly.ts:313、src/security/securityPipeline.ts:19。受影响的包括 webhook 和数
  据采集入口，src/routes/index.ts:377、src/routes/index.ts:396、src/routes/index.ts:415。这会导致这些请求在进入统一审计和防护前就被 处理并返回。
- High TTS 配额控制不是原子操作，队列化后会被并发提交穿透。提交阶段只读剩余额度，src/tts/tts.pipeline.ts:211；真正扣减是在异步生成
  成功之后，src/tts/tts.queue.ts:85；底层更新也只是读改写，src/utils/userRepository.ts:145。多个并发请求可以在“都看到还有额度”后一
  起入队，最终超额。
- High TTS 的生成码配置被硬耦合到 Mongo 模型，即使仓库宣称支持 file/mysql。启动时仍暴露了 config.generationCode 概念，src/app/
- Medium TTS 的去重、历史、惩罚状态分散在三套介质里，部署一扩容就会不一致。匿名去重和历史走本地 JSON，src/utils/storage.ts:71、src/
  tts/tts.controller.ts:332；登录用户重复记录走 userGenerationService，src/tts/tts.pipeline.ts:222；重复命中惩罚又是进程内 Map，
  src/tts/tts.service.ts:108。单机还能工作，多实例时语义会漂移。

Assumptions

- 我按“USER_STORAGE_MODE=file/mysql 也应能跑主要 TTS 流程”来审查；如果你的真实前提是“生产必须带 Mongo”，第 4 条会从“功能缺陷”降级
  为“架构边界误导”。
- 这次是静态审查，未运行接口测试或压测。你提到的乱码问题确认只是 PowerShell 输出编码，不是文件损坏。

Direction

- 先修密码链路：统一哈希、比对、迁移旧数据。
- 把安全中间件改成“默认全覆盖”，raw body 需求只在个别路由局部处理，不要靠提前挂载整组路由。
- 给 TTS 建明确端口层：QuotaLedger、JobStore、GenerationHistoryStore、SettingsStore，tts.pipeline 不要直接碰 mongoose、本地文件和进
  程内状态。
- 配额改成“提交时预占，完成时确认/回滚”，并把匿名去重和历史放到同一后端存储或 Redis。
- src/app.ts 现在已经够薄，route registry + security pipeline 是对的方向；真正要收敛的是底层状态源和跨模块边界。

如果你要，我下一步可以直接给一版“按优先级的后端重构路线图”，或者先把“明文密码链路”这一项拆成可落地改造方案。

─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

› 接给一版“按优先级的后端重构路线图”

• 路线图

建议按 P0 -> P1 -> P2 -> P3 执行，不要并行大改。现在这个后端的主要问题不是“模块太多”，而是“状态源太散、边界不一致、关键链路有安全
债”。

1. P0 安全止血
   目标：先修必须立刻处理的风险，再谈重构。

- 统一密码链路为 bcrypt，覆盖注册、登录、重置密码、旧用户迁移。重点文件：src/controllers/authController.ts、src/utils/
  userRepository.ts、src/utils/providers/\*UserStorageProvider.ts、src/services/userService.ts。
- 给旧明文密码做兼容迁移策略：首次登录成功后自动重哈希，或跑一次离线迁移脚本。
- 收敛敏感字段读取范围，减少 password 在查询和日志中的暴露。
- 验收标准：新老存储模式都只能保存 hash；登录比对全部走 bcrypt.compare；旧用户可平滑迁移。

2. P1 安全管线收口
   目标：让所有请求默认走统一安全链，例外必须显式声明且最小化。

- 调整 /F:/Repositories/GitHub/Synapse/src/app/assembly.ts:283，不要在 registerCoreMiddleware 里提前挂整组
  preParserRouteModules。
- 把 webhook/raw-body 需求改成“局部路由自带解析器”，而不是“为了少数接口把整组路由提前到安全栈之前”。
- 保留现在 /F:/Repositories/GitHub/Synapse/src/security/securityPipeline.ts:19 这种“可声明的安全步骤”，但要改成默认全覆盖。
- 路由治理继续保留，并补一条规则：凡是绕过 ipBan/auditLog/WAF 的模块，必须有精确原因，且只能是单一路径。
- 验收标准：除明确白名单外，所有 /api/\* 请求都先经过 ip ban -> audit log -> WAF。

3. P2 TTS 状态源统一
   目标：把 TTS 从“能跑”改成“可扩展、可多实例”。

- 抽出四个端口接口：
  QuotaLedger、TtsSettingsStore、TtsJobStore、GenerationHistoryStore。
- 让 /F:/Repositories/GitHub/Synapse/src/tts/tts.pipeline.ts:57 不再直接依赖 mongoose、StorageManager、UserStorage 的具体实现。
- 去掉 TtsSettingModel 在 TTS 模块内的直连，把生成码配置并入统一配置仓储。
- 把匿名去重、本地历史、重复惩罚、用户重复记录这些分散状态统一到同一后端，至少做到“单语义单存储”。
- 验收标准：TTS 在 file/mongo/mysql 三种用户存储模式下，行为一致且不要求偷偷依赖 Mongo。

4. P3 配额模型改造
   目标：解决并发穿透和异步队列后的超额问题。

- 把“提交时检查额度、成功后再扣减”改成“提交时预占额度，完成时确认，失败时回滚”。
- 预占记录要和任务 taskId 绑定，避免重复提交或 worker 重试导致双扣。
- 队列处理只消费已预占成功的任务，不再自行决定额度。
- 如果先不做完整事务，至少给 incrementUsage 做原子更新能力，不要继续读改写。
- 验收标准：并发 20 个请求打同一用户，不会突破日限额。

5. P4 模块边界整理
   目标：把现在“兼容导出 + 新旧混用”收干净。

- 第 3-4 周：P2 + P3
- 第 5 周：P4 + P5

落地原则

- 先修安全和一致性，再做目录美化。
- 先统一状态源，再做服务拆分。
- 先定义端口接口，再替换实现，不要边搬文件边改行为。
