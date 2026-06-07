# Rust/Node 混合后端需求冻结

日期：2026-06-07

## 目标

在不重写现有 TypeScript/Express 后端的前提下，引入 Rust sidecar/worker，让复杂、重计算、低层网络或音频处理能力由 Rust 承担，Node 继续负责公网 API、认证、授权、限流、审计、任务状态和业务编排。

## 冻结决策

- Node/Express 仍是唯一公网入口。
- Rust 服务只作为内网 sidecar 或 worker，不直接暴露给公网。
- 第一阶段优先迁移 `network` 模块中边界清晰的 `tcping`、`portscan`，再评估 `ping` 和 `speed`。
- 第二阶段在 TTS provider 返回音频 buffer 后、写入磁盘和 MongoDB 前，插入可选 Rust 音频后处理。
- OAuth、JWT、API Key、WAF、rate limit、用户、配置、审计、TTS 队列主状态不迁移到 Rust。
- 所有 Rust 调用必须通过 Node 适配层，且支持 feature flag 回退到现有实现。
- 不执行依赖安装命令；实现阶段只修改代码、配置、Docker 构建定义和文档。

## 范围

### 包含

- 新增 Rust workspace，用于承载 `network-tools` sidecar，后续承载 `audio-worker`。
- 新增 Node 内部服务调用客户端，统一处理 internal token、超时、错误映射和健康检查。
- 修改 `NetworkService`，按配置决定使用 Rust sidecar 或现有外部 API 代理。
- 修改 TTS 音频生成链路，在 Rust 音频处理启用时对 provider buffer 做后处理。
- 修改 Docker / Compose，使生产部署可选择启用 Rust sidecar。
- 补充单元测试、集成测试、部署说明和回滚说明。

### 不包含

- 全量 Rust 重写后端。
- 将 Rust 服务直接暴露给第三方。
- 改造前端页面。
- 改造 OAuth、API Key、JWT、WAF、rate limiter 的权限模型。
- 改变现有公网 API 响应结构。
- 将 MongoDB/MySQL/Redis 存储模型迁移到 Rust。

## 接受标准

- 未启用 Rust 配置时，现有 Node 行为保持不变。
- 启用 `network-tools` 后，`/api/network/tcping` 和 `/api/network/portscan` 仍通过原有 Node 路由、认证和限流访问。
- Rust `network-tools` 失败、超时或健康检查失败时，Node 能按配置回退到现有外部 API 代理或返回明确错误。
- Rust 服务必须校验 `X-Internal-Token`，且仅绑定内网地址或容器内网络。
- Rust 网络能力必须有目标地址、端口范围、超时、并发数量限制。
- TTS 音频后处理启用时，输出文件名、缓存命中、Mongo asset 持久化、历史记录和 WebSocket 通知流程不变。
- 所有新增配置都有默认关闭值，生产环境可显式启用。
- 后端 TypeScript 编译、目标 Jest 测试、Rust 单元测试和 Docker Compose 配置检查通过。

## 产品验收

- 第三方和前端调用方不需要改变现有 API 地址。
- 管理员可以通过环境变量启停 Rust sidecar。
- 线上异常时可以只关闭 Rust feature flag 回退 Node 实现，不需要回滚整套服务。
- 日志能区分 `node-fallback`、`rust-network-tools`、`rust-audio-worker` 的处理来源。

## 手动抽查

- 使用 API Key 或 OAuth `network` scope 调用 `/api/network/tcping`。
- 暂停 Rust `network-tools` 后再次调用，确认回退或错误符合配置。
- 用非法端口、过大端口范围、内网敏感地址测试 Rust 和 Node 双层限制。
- 启用音频后处理后生成一条 TTS，确认文件可播放、历史记录正常、Mongo asset 可恢复。
- 关闭音频后处理后再次生成，确认回到当前纯 Node 链路。

## 约束

- 不执行安装命令。
- 不改变现有认证中间件顺序。
- 不删除或回退用户已有改动。
- Rust 只处理已通过 Node 鉴权和业务校验的请求。
- Node 与 Rust 的内部协议必须可测试、可回退、可观测。

## 假设

- 生产部署允许增加一个或多个 sidecar 容器。
- CI 或构建环境可以在未来执行 Cargo 构建，但本计划阶段不执行依赖安装。
- 音频后处理第一版以分析、格式安全校验、响度/元数据处理为主；复杂转码可作为后续增强。
- 网络工具中 ICMP ping 可能受运行权限影响，因此第一阶段优先使用无特权 TCP 能力。

## 完成表述规则

只有在对应代码、测试、部署配置和文档都完成并验证后，才能表述为“混合部署已完成”。规划阶段只能表述为“计划已产出”。
