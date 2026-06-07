# Rust/Node 混合后端需求冻结

日期：2026-06-07

## 目标

在不重写现有 TypeScript/Express 后端的前提下，引入 Rust 内部服务和 worker，让复杂、重计算、低层网络、音频、文件、数据处理、安全计算和离线分析能力逐步由 Rust 承担。Node 继续负责公网 API、认证、授权、限流、审计、任务状态、存储事务、业务编排和对外响应结构。

生产形态允许“超级缝合”部署：同一个生产 app Docker 镜像内包含 Node 后端和 Rust 二进制，Node 主进程在启动时唤醒、配置、健康检查和重启 Rust 子进程。外置 sidecar 仍保留为可选部署方式，但不得让 Rust 直接成为公网入口。

## 冻结决策

- Node/Express 仍是唯一公网入口，所有第三方和前端请求必须先进入 Node。
- 分层原则固定为：普通业务逻辑留在 Node；CPU 密集、二进制/媒体处理密集、低层网络探测、安全边界明确且可纯函数化的任务放 Rust 内部服务。
- Rust 服务只作为 Node 管理下的内网能力提供者，可运行于 Node 进程旁的内嵌子进程，也可运行于同一内网/Compose 网络中的外置 sidecar。
- 生产环境未显式配置相关变量时，`RUST_NETWORK_TOOLS_ENABLED`、`RUST_AUDIO_WORKER_ENABLED`、`RUST_EMBEDDED_SERVICES_ENABLED` 默认启用 Rust；测试环境默认关闭；显式设置为 `false`、`0`、`no`、`off` 或空字符串时关闭。
- Node 主进程负责内嵌 Rust 生命周期：根据 loopback URL 启动 Rust 二进制，注入 `INTERNAL_SERVICE_TOKEN` 和 bind addr，等待 `/healthz`，记录日志，Rust 异常退出后按退避策略重启，Node 收到退出信号时终止 Rust 子进程。
- 外置 sidecar 模式必须显式配置同一个 `INTERNAL_SERVICE_TOKEN` 到 Node 和 Rust；内嵌模式可以在未配置时由 Node 每次启动生成临时 token，并只注入本次启动的 Rust 子进程。
- `INTERNAL_SERVICE_TOKEN` 可以每次 Node 启动不同，但只适用于内嵌 Rust 模式。跨容器、跨进程、滚动发布或多副本外置 sidecar 必须使用稳定的随机 token，并在 Node 与 Rust 同步轮换。
- 第一阶段迁移 `network` 模块中边界清晰的 `tcping`、`portscan`。
- 第二阶段在 TTS provider 返回音频 buffer 后、写入磁盘和 MongoDB asset 前，插入可选 Rust 音频后处理。
- Rust `audio-worker` 不调用 OpenAI，也不生成 TTS 音频。OpenAI 或其他 provider 调用仍由 Node 的 TTS provider 链路完成，Rust 只处理 Node 已拿到的音频 buffer。
- OAuth、JWT、API Key、WAF、rate limit、用户、管理员权限、配置中心、审计、计费、TTS 队列主状态、数据库事务、WebSocket 和公网 controller/router 不迁移到 Rust。
- 所有 Rust 调用必须通过 Node 适配层，支持超时、错误映射、健康检查、观测日志和 feature flag 回退。
- 不执行依赖安装命令；实现阶段只修改代码、配置、Docker 构建定义、CI 和文档。

## 范围

### 当前包含

- Rust workspace：`rust-services/`。
- Rust `network-tools`：`GET /healthz`、`POST /v1/network/tcping`、`POST /v1/network/portscan`。
- Rust `audio-worker`：`GET /healthz`、`POST /v1/audio/process`。
- Node 内部服务调用层：统一处理 internal token、超时、错误映射、健康检查和来源标记。
- `NetworkService` 按配置决定使用 Rust `network-tools` 或现有外部 API fallback。
- TTS 音频生成链路在 provider buffer 返回后、写磁盘和持久化前调用 Rust 音频后处理。
- 生产 Docker 镜像包含 Rust 二进制，Node 可在同一容器进程树中唤醒 Rust 子进程。
- Compose 保留外置 sidecar 部署能力，但默认不得改变 Node 作为公网入口的事实。
- CI 增加 Rust workspace 格式和测试检查。
- 部署、配置、健康检查、回滚和故障说明。

### 后续包含

- 扩展 `network-tools`：`ping`、`speedTest`、DNS resolve、HTTP timing、TLS timing。
- 扩展 `audio-worker`：`flacToMp3`、格式检测、duration/bitrate 分析、静音裁剪、响度标准化、元数据清理、转码和压缩。
- 新增 `file-worker` 或 `media-worker`：magic number MIME 检测、文件 hash/去重、大文件流式校验、图片尺寸、EXIF 清理、图片压缩/WebP、压缩包和 zip bomb 检查。
- 新增 `data-tools`：批量 hash/base64、字符编码转换、CSV/JSON 清洗和校验、大文本解析、压缩和解压缩。
- 新增 `security-worker`：PoW 校验、HMAC/AES-GCM 等纯计算封装、纯函数风险评分、内容规则和禁词扫描。
- 新增 `analytics-worker`：使用量聚合预处理、大日志扫描、导出报表生成、离线路由和安全审计计算。

### 不包含

- 全量 Rust 重写后端。
- 将 Rust 服务直接暴露给第三方。
- 改造前端页面。
- 改造 OAuth、API Key、JWT、WAF、rate limiter 的权限模型或中间件顺序。
- 改变现有公网 API 响应结构。
- 将 MongoDB/MySQL/Redis 存储模型、事务和业务状态迁移到 Rust。
- 将 TTS 任务状态机、历史记录、WebSocket 推送或文件命名规则迁移到 Rust。
- 让 Rust 做账号封禁、配额扣减、管理员审批或任何需要业务状态的最终决策。

## 配置要求

| 变量 | 生产未配置默认值 | 说明 |
| --- | --- | --- |
| `RUST_EMBEDDED_SERVICES_ENABLED` | `true` | Node 是否启动和监管内嵌 Rust 子进程。测试环境默认 `false`。 |
| `RUST_NETWORK_TOOLS_ENABLED` | `true` | 是否优先调用 Rust 网络工具。测试环境默认 `false`。 |
| `RUST_NETWORK_TOOLS_URL` | `http://127.0.0.1:4010` | 内嵌模式必须是 loopback URL；外置 sidecar 可改为 Compose 服务名。 |
| `RUST_NETWORK_TOOLS_TIMEOUT_MS` | `5000` | Node 调用 Rust 网络工具的超时。 |
| `RUST_NETWORK_TOOLS_FALLBACK_ENABLED` | `true` | Rust 网络工具失败时是否回退现有 Node/外部 API 路径。 |
| `RUST_NETWORK_TOOLS_BLOCK_PRIVATE_TARGETS` | `true` | 是否禁止探测私有、link-local 等敏感地址。 |
| `RUST_AUDIO_WORKER_ENABLED` | `true` | 是否优先调用 Rust 音频后处理。测试环境默认 `false`。 |
| `RUST_AUDIO_WORKER_URL` | `http://127.0.0.1:4020` | 内嵌模式必须是 loopback URL；外置 sidecar 可改为 Compose 服务名。 |
| `RUST_AUDIO_WORKER_TIMEOUT_MS` | `30000` | Node 调用 Rust 音频 worker 的超时。 |
| `RUST_AUDIO_WORKER_MAX_BYTES` | `20971520` | Rust 音频 worker 最大输入 buffer。 |
| `RUST_AUDIO_WORKER_FALLBACK_ENABLED` | `true` | Rust 音频后处理失败时是否回退原始 buffer。 |
| `INTERNAL_SERVICE_TOKEN` | 内嵌模式自动生成；外置模式必须配置 | Node 与 Rust 内部 HTTP 合同的共享 token。 |

## Rust 迁移候选池

### Network Tools

- 已完成：`tcping`、`portscan`。
- 待迁移：ICMP `ping`、`speedTest`、DNS resolve、HTTP 首包/总耗时、TLS 握手和证书基础信息。
- 约束：所有网络目标必须先经 Node 鉴权和业务校验，再由 Rust 做二次地址、端口、超时、并发和私网限制。

### Audio Worker

- 已完成：TTS provider buffer 后处理合同、passthrough/analyze/normalize 基础链路。
- 待迁移：`flacToMp3`、格式探测、时长/码率分析、静音裁剪、响度标准化、元数据清理、转码、压缩。
- 约束：Rust 不调用 OpenAI，不决定 provider，不决定文件名，不写数据库，不发送 WebSocket，只返回处理后的 buffer 和元数据。

### File / Media Worker

- 待迁移：MIME magic number 检测、文件 hash 和去重预处理、大文件流式大小/类型校验、图片尺寸探测、EXIF 清理、图片压缩/WebP、压缩包层级和 zip bomb 检查。
- 约束：Rust 只返回检测结果或处理后的 bytes，是否接受文件、是否入库、是否对用户展示仍由 Node 决定。

### Data Tools

- 待迁移：大批量 hash/base64、编码转换、CSV/JSON 清洗、JSON schema 前置校验、大文本解析、压缩和解压缩。
- 约束：Rust 不直接读取业务数据库，不替代 Node 的权限和业务字段解释。

### Security Worker

- 待迁移：PoW 校验、HMAC/AES-GCM 纯计算、请求特征纯函数评分、内容规则和禁词扫描。
- 约束：Rust 不做最终封禁、限流、放行、扣额度、冻结账号或管理员策略决策。Rust 只能返回可解释的评分、匹配项和计算结果，Node 保留策略执行权。

### Analytics Worker

- 待迁移：使用量聚合预处理、大日志扫描、导出报表生成、离线路由审计和安全审计计算。
- 约束：Rust 产出中间结果或报表内容，Node 负责权限校验、任务记录、下载授权和审计落库。

## 接受标准

- 第三方和前端 API 地址、认证方式、响应结构不变。
- Node 仍是唯一公网入口，Rust 只监听 loopback 或内网容器网络。
- 生产镜像在未显式关闭 Rust 时优先使用 Node 监管的内嵌 Rust 服务；外置 sidecar 作为可选部署模式。
- Rust 服务必须校验 `X-Internal-Token`。
- 内嵌模式未配置 `INTERNAL_SERVICE_TOKEN` 时，Node 自动生成临时 token 并注入 Rust；外置 sidecar 模式未配置 token 时必须拒绝启用。
- Rust `network-tools` 失败、超时或健康检查失败时，Node 能按配置回退到现有外部 API 代理或返回明确错误。
- Rust `network-tools` 必须限制目标地址、端口范围、超时、端口数量和并发数量。
- TTS 音频后处理启用时，输出文件名、缓存命中、Mongo asset 持久化、历史记录和 WebSocket 通知流程不变。
- Rust 音频处理失败且 fallback 开启时，Node 使用原始 provider buffer 继续原链路。
- 后续新增 worker 都必须先定义内部 HTTP 合同、Node client、feature flag、fallback、测试和部署说明。
- 后端 TypeScript 编译、目标 Jest 测试、Rust 单元测试和 Docker Compose 配置检查在可用环境中通过；缺少依赖或工具时必须如实说明。

## 产品验收

- 第三方和前端调用方不需要改变现有 API 地址。
- 管理员可以通过环境变量启停 Rust 总开关、单个 Rust worker 和 fallback。
- 生产未配置 Rust 开关时默认走 Rust；需要回滚时显式设置对应 `RUST_*_ENABLED=false`。
- Node 日志能区分 `node-fallback`、`rust-network-tools`、`rust-audio-worker` 和后续 Rust worker 来源。
- Node 启动日志能说明内嵌 Rust 是否启动、是否生成临时 token、健康检查是否成功、是否因二进制缺失或 URL 非 loopback 跳过内嵌启动。
- Rust 子进程崩溃后由 Node 记录退出原因并尝试重启；Node 退出时 Rust 子进程同步终止。

## 手动抽查

- 使用 API Key 或 OAuth `network` scope 调用 `/api/network/tcping`。
- 暂停或杀掉 Rust `network-tools` 后再次调用，确认 Node 重启内嵌 Rust，或按 fallback 配置回退/报错。
- 用非法端口、过大端口范围、内网敏感地址测试 Rust 和 Node 双层限制。
- 启用音频后处理后生成一条 TTS，确认文件可播放、历史记录正常、Mongo asset 可恢复。
- 关闭音频后处理后再次生成，确认回到原始 provider buffer 链路。
- 内嵌模式不设置 `INTERNAL_SERVICE_TOKEN` 启动，确认 Node 生成临时 token 且 Rust 健康检查通过。
- 外置 sidecar 模式不设置 `INTERNAL_SERVICE_TOKEN` 启动，确认配置校验拒绝启用。

## 约束

- 不执行安装命令。
- 不改变现有认证中间件顺序。
- 不删除或回退用户已有改动。
- Rust 只处理已通过 Node 鉴权和业务校验的请求。
- Node 与 Rust 的内部协议必须可测试、可回退、可观测。
- 任何新 Rust worker 都必须保留 Node 的业务所有权和最终决策权。
- 任何 Rust 输出都不得回显 internal token、真实 API key、本地绝对路径或敏感环境变量。

## 假设

- 生产 Docker 构建环境可编译 Rust 二进制并把它们复制到 app runtime 镜像。
- 生产部署允许 Node 在同一容器进程树中启动 Rust 子进程。
- 如选择外置 sidecar，生产部署允许增加一个或多个 sidecar 容器，并可通过容器内网访问。
- CI 或构建环境可以执行 Cargo 构建和测试，但本计划阶段不执行依赖安装。
- 网络工具中 ICMP ping 可能受运行权限影响，因此迁移时必须处理无特权环境下的降级或明确错误。
- 音频转码、图片压缩、压缩包检查等能力可按 crate 可用性和部署成熟度分批落地。

## 完成表述规则

- 只有在对应代码、测试、部署配置和文档都完成并验证后，才能表述为“混合部署已完成”。
- 只完成某个 worker 时，只能表述该 worker 的混合部署已完成。
- 只产出或更新本文档时，只能表述为“混合部署需求已更新”。
- 未验证的性能收益只能表述为“预期收益”，不能表述为“已经提升”。
