# Rust/Node 混合后端执行计划

日期：2026-06-07

## 内部执行等级

等级：XL

原因：该工作跨 Node 后端、Rust 内部服务、Docker 部署、CI、测试和文档。执行时必须按 worker 和波次推进，避免一次性改动认证、路由、TTS 队列、数据库事务和部署入口。

## 总体架构

```text
Frontend / third-party clients
  -> Node Express public API
     -> WAF / IP checks / JWT / API Key / OAuth / rate limit
     -> controllers
     -> TypeScript services
        -> internal service clients
           -> embedded Rust child processes supervised by Node, default in production
           -> external Rust sidecars on container network, optional profile
     -> existing storage / queues / audit / WebSocket
```

Node 继续控制：

- 公网路由和中间件顺序。
- OAuth、JWT、API Key、WAF、rate limit。
- 用户、管理员、权限、计费和审计。
- 参数归一化和业务校验。
- MongoDB/MySQL/Redis 事务和业务状态。
- TTS 队列状态机、文件名、历史记录和 WebSocket。
- Rust 生命周期编排、失败回退、错误映射和对外响应结构。

Rust 只处理：

- CPU 密集任务。
- 二进制、媒体、音频、图片、压缩包等 bytes 密集任务。
- 低层网络探测。
- 安全边界明确、可纯函数化、无需业务状态的计算任务。

普通业务逻辑留在 Node。Rust sidecar/内部服务只接收 Node 已鉴权、已授权、已做业务校验的任务，并且仍要做二次输入校验。

## 生产部署原则

- 生产 Docker app 镜像包含 Node 后端和 Rust 二进制。
- 生产未显式设置 Rust 相关开关时，`network-tools`、`audio-worker` 和内嵌 Rust supervisor 默认启用。
- Node 主进程负责唤醒 Rust：读取 `RUST_*_URL`，只对 loopback URL 启动内嵌二进制，注入 bind addr 和 `INTERNAL_SERVICE_TOKEN`，等待 `/healthz`。
- Node 主进程负责监管 Rust：转发日志、记录退出原因、异常退出后按退避策略重启，Node 退出时终止 Rust 子进程。
- 外置 sidecar 模式保留给 Compose profile 或独立部署；该模式必须显式配置同一个 `INTERNAL_SERVICE_TOKEN` 到 Node 和 Rust。
- 内嵌模式未配置 `INTERNAL_SERVICE_TOKEN` 时，Node 可以每次启动生成临时 token 并注入 Rust 子进程；外置 sidecar、多副本和滚动发布不能使用各自独立生成的 token。

## 目标文件结构

已落地的 Rust workspace：

```text
rust-services/
  Cargo.toml
  Cargo.lock
  network-tools/
    Cargo.toml
    src/
      main.rs
      config.rs
      auth.rs
      error.rs
      http.rs
      models.rs
      validation.rs
      probes/
        mod.rs
        tcping.rs
        portscan.rs
      tests/
        validation_tests.rs
  audio-worker/
    Cargo.toml
    src/
      main.rs
      config.rs
      auth.rs
      error.rs
      http.rs
      models.rs
      processing/
        mod.rs
        analyze.rs
        normalize.rs
        passthrough.rs
      tests/
        audio_contract_tests.rs
```

后续 Rust worker 目标：

```text
rust-services/
  file-worker/
    Cargo.toml
    src/
      main.rs
      config.rs
      auth.rs
      error.rs
      http.rs
      models.rs
      detection/
      images/
      archives/
  data-tools/
    Cargo.toml
    src/
      main.rs
      config.rs
      auth.rs
      error.rs
      http.rs
      models.rs
      hashing/
      encoding/
      parsing/
      compression/
  security-worker/
    Cargo.toml
    src/
      main.rs
      config.rs
      auth.rs
      error.rs
      http.rs
      models.rs
      pow.rs
      crypto.rs
      risk.rs
      content_rules.rs
  analytics-worker/
    Cargo.toml
    src/
      main.rs
      config.rs
      auth.rs
      error.rs
      http.rs
      models.rs
      aggregation/
      logs/
      reports/
      audits/
```

已落地或需扩展的 Node 文件：

```text
src/config/config.ts
src/app/startup.ts
src/services/embeddedRustServices.ts
src/services/internalServiceClient.ts
src/services/rustNetworkToolsClient.ts
src/services/rustAudioWorkerClient.ts
src/services/networkService.ts
src/controllers/networkController.ts
src/tts/tts.ports.ts
src/tts/tts.audioPostProcessor.ts
src/tts/tts.service.ts
src/tests/internalServiceClient.test.ts
src/tests/rustNetworkToolsClient.test.ts
src/tests/networkService.test.ts
src/tests/ttsRustAudioWorker.test.ts
```

后续 Node client 目标：

```text
src/services/rustFileWorkerClient.ts
src/services/rustDataToolsClient.ts
src/services/rustSecurityWorkerClient.ts
src/services/rustAnalyticsWorkerClient.ts
src/tests/rustFileWorkerClient.test.ts
src/tests/rustDataToolsClient.test.ts
src/tests/rustSecurityWorkerClient.test.ts
src/tests/rustAnalyticsWorkerClient.test.ts
```

部署、CI 和文档：

```text
Dockerfile
docker-compose.yml
.dockerignore
package.json
.github/workflows/tsc.yml
docs/rust-node-hybrid-deployment.md
docs/requirements/2026-06-07-rust-node-hybrid-backend.md
docs/plans/2026-06-07-rust-node-hybrid-backend-execution-plan.md
```

## 所有权边界

Node 所有权：

- `src/routes/*` 的公网路由和中间件顺序。
- `src/controllers/*` 的 HTTP 输入输出。
- `src/services/*` 的业务编排、鉴权后能力调用、错误映射和 fallback。
- `src/tts/*` 的任务队列、状态、文件名、持久化、历史记录、缓存和 WebSocket。
- `src/config/config.ts` 的环境变量解析、默认值和启动校验。
- `src/services/embeddedRustServices.ts` 的内嵌 Rust 启动、健康检查、重启和关闭。

Rust 所有权：

- 内部 HTTP 合同、`X-Internal-Token` 校验、超时、输入大小和并发限制。
- `network-tools` 的 TCP 探测、端口扫描和后续 DNS/HTTP/TLS/ICMP 探测。
- `audio-worker` 的音频 buffer 分析和后处理。
- 后续 file/media、data、security、analytics worker 的纯计算或 bytes 处理。

部署所有权：

- `Dockerfile` 负责把 Rust 二进制编译并复制进 app runtime 镜像，同时保留独立 Rust runtime target。
- `docker-compose.yml` 默认运行 app 容器内嵌 Rust，外置 sidecar 通过 profile 启用。
- `.github/workflows/tsc.yml` 同时做 Node 构建、Rust fmt 和 Rust tests。

## 波次 0：基线和保护

目标：先记录当前行为，不动实现。

文件：

- `src/tests/networkService.test.ts`
- `src/tests/networkController.test.ts`
- `src/tests/network-apis.test.ts`
- `src/tests/flacToMp3Service.test.ts`
- `src/tests/tts*.test.ts`，按现有测试名实际选择。

动作：

1. 固化 `/api/network/tcping`、`/api/network/portscan` 的当前响应包装：`success`、`message`、`data`、`error`。
2. 固化 OAuth/API Key 进入 network 路由的现有行为。
3. 固化 TTS 生成成功后的 `fileName`、`audioUrl`、`outputFormat`、`provider` 字段。
4. 记录现有网络工具对外部 `https://v2.xxapi.cn/api` 的依赖，后续作为 fallback。

验证：

```bash
npm run test -- --testPathPattern="networkService|networkController|network-apis"
npm run test -- --testPathPattern="tts|flacToMp3"
```

## 波次 1：Rust network-tools sidecar

目标：实现独立 Rust 内网服务。

接口：

```text
GET  /healthz
POST /v1/network/tcping
POST /v1/network/portscan
```

要求：

- 必须校验 `X-Internal-Token`。
- `timeoutMs` 默认 3000，最大 10000。
- `portscan` 最大端口数量第一版限制为 128。
- `concurrency` 最大 64。
- 禁止空地址、非法端口、明显危险的地址格式。
- 是否禁止内网地址由配置控制，生产默认禁止。

验证：

```bash
cargo test --manifest-path rust-services/Cargo.toml
cargo run --manifest-path rust-services/network-tools/Cargo.toml
```

## 波次 2：Node 内部服务客户端

目标：Node 能安全、统一地调用 Rust 内部服务。

新增或修改文件：

- `src/services/internalServiceClient.ts`
- `src/services/rustNetworkToolsClient.ts`
- `src/tests/internalServiceClient.test.ts`
- `src/tests/rustNetworkToolsClient.test.ts`
- `src/config/config.ts`

配置：

```text
INTERNAL_SERVICE_TOKEN=
RUST_NETWORK_TOOLS_ENABLED=<production default true, test default false>
RUST_NETWORK_TOOLS_URL=http://127.0.0.1:4010
RUST_NETWORK_TOOLS_TIMEOUT_MS=5000
RUST_NETWORK_TOOLS_FALLBACK_ENABLED=true
RUST_NETWORK_TOOLS_BLOCK_PRIVATE_TARGETS=true
```

职责：

- 自动带 `X-Internal-Token`。
- 设置请求超时。
- 统一解析 JSON。
- 将 Rust 401/403/429/5xx 映射为内部错误。
- 暴露 `getHealth()` 和 `postJson()`。
- 不处理 Express `Request` / `Response`。

验证：

```bash
npm run test -- --testPathPattern="internalServiceClient|rustNetworkToolsClient"
```

## 波次 3：接入 NetworkService

目标：Node 公网 API 不变，内部按 feature flag 使用 Rust。

修改文件：

- `src/services/networkService.ts`
- `src/controllers/networkController.ts`
- `src/tests/networkService.test.ts`
- `src/tests/networkController.test.ts`
- `src/tests/network-apis.test.ts`

行为：

- `tcpPing()` 先检查 `config.rustServices.networkTools.enabled`。
- 启用时调用 `RustNetworkToolsClient.tcpPing()`。
- Rust 成功时返回当前 `NetworkTestResponse` 结构。
- Rust 失败且 `fallbackEnabled=true` 时记录 warning 并调用现有外部 API。
- Rust 失败且 `fallbackEnabled=false` 时返回明确错误。
- `portScan()` 使用同样策略。
- `ping()` 和 `speedTest()` 在后续 network-tools 扩展波次处理。

验证：

```bash
npm run test -- --testPathPattern="networkService|networkController|network-apis"
npm run build:backend
```

## 波次 4：Docker、CI 和内嵌 Rust 监管

目标：生产 app 镜像内包含 Rust，并由 Node 主进程监管 Rust 子进程；外置 sidecar 保留可选。

新增或修改文件：

- `Dockerfile`
- `docker-compose.yml`
- `.dockerignore`
- `package.json`
- `.github/workflows/tsc.yml`
- `src/app/startup.ts`
- `src/services/embeddedRustServices.ts`
- `docs/rust-node-hybrid-deployment.md`

要求：

- Docker build 增加 Rust builder 阶段，产出 `network-tools` 和 `audio-worker` 二进制。
- app runtime 镜像复制 Rust 二进制到 `/usr/local/bin/`。
- `RUST_EMBEDDED_SERVICES_ENABLED=true` 时，Node 在启动阶段启动 loopback URL 对应的 Rust 子进程。
- `RUST_NETWORK_TOOLS_BIN` 和 `RUST_AUDIO_WORKER_BIN` 可覆盖二进制路径。
- 内嵌 Rust 健康检查超时不阻断 Node 启动，但必须记录 warning 并允许后续 fallback。
- Rust 子进程异常退出后退避重启，Node 退出时清理子进程。
- Compose 默认 app 内嵌 Rust；`rust-sidecars` profile 才启动外置 `network-tools` 和 `audio-worker` 服务。
- CI 中 `tsc.yml` 增加 Rust toolchain、`cargo fmt --manifest-path rust-services/Cargo.toml --all --check` 和 `cargo test --manifest-path rust-services/Cargo.toml`。

验证：

```bash
npm run build:backend
cargo fmt --manifest-path rust-services/Cargo.toml --all --check
cargo test --manifest-path rust-services/Cargo.toml
docker compose config
```

## 波次 5：Rust audio-worker 合同

目标：定义音频处理合同，再接入 TTS。

接口：

```text
GET  /healthz
POST /v1/audio/process
```

请求：

```json
{
  "audioBase64": "<audio bytes>",
  "outputFormat": "mp3",
  "taskId": "tts_xxx",
  "contentHash": "...",
  "operations": ["passthrough", "analyze"]
}
```

响应：

```json
{
  "success": true,
  "data": {
    "outputFormat": "mp3",
    "durationMs": 1234,
    "size": 45678,
    "audioBase64": "<processed bytes>",
    "source": "rust-audio-worker"
  }
}
```

第一版操作：

- `passthrough`：合同验证和大小限制，不改变音频。
- `analyze`：返回大小、格式和可选时长。
- `normalize`：只在依赖和部署成熟后启用。

限制：

- 最大输入大小默认 20MB。
- 超时默认 30 秒。
- 不接受 URL 输入，只接受 Node 已持有的 buffer。
- Rust 不调用 OpenAI，不生成 TTS，不写数据库，不决定文件名，不发送 WebSocket。

验证：

```bash
cargo test --manifest-path rust-services/Cargo.toml
```

## 波次 6：接入 TTS 音频后处理

目标：在不改变 TTS 任务状态机的情况下，插入可选后处理。

新增或修改文件：

- `src/services/rustAudioWorkerClient.ts`
- `src/tts/tts.audioPostProcessor.ts`
- `src/config/config.ts`
- `src/tts/tts.ports.ts`
- `src/tts/tts.service.ts`
- `src/tests/ttsRustAudioWorker.test.ts`

配置：

```text
RUST_AUDIO_WORKER_ENABLED=<production default true, test default false>
RUST_AUDIO_WORKER_URL=http://127.0.0.1:4020
RUST_AUDIO_WORKER_TIMEOUT_MS=30000
RUST_AUDIO_WORKER_MAX_BYTES=20971520
RUST_AUDIO_WORKER_FALLBACK_ENABLED=true
```

接入点：

```ts
const response = await this.requestSpeechWithRetry(request, safeOutputFormat);
const processed = await this.audioPostProcessor.process({
  audioBuffer: response.audioBuffer,
  outputFormat: safeOutputFormat,
  taskId: request.taskId,
  contentHash,
});
await fs.promises.writeFile(filePath, processed.audioBuffer);
await ttsAudioAssetStore.persistAudioAsset({ buffer: processed.audioBuffer, ... });
```

要求：

- OpenAI 和其他 TTS provider 调用仍在 Node。
- Rust 只处理 provider 返回后的 audio buffer。
- Rust 失败且 fallback 开启时回退原始 buffer。
- 文件名、缓存命中、Mongo asset、历史记录、任务状态和 WebSocket 不变。

验证：

```bash
npm run test -- --testPathPattern="ttsRustAudioWorker|tts"
npm run build:backend
```

## 波次 7：文档、观测和运维

新增或修改文件：

- `docs/rust-node-hybrid-deployment.md`
- `docs/backend-optimization-draft.md`
- `src/config/startupDiagnostics.ts`
- `src/services/operationalStatusService.ts`，如需要把 Rust health 暴露给管理诊断。

内容：

- 环境变量说明。
- 生产默认 Rust 和测试默认关闭说明。
- 内嵌 Rust supervisor 生命周期。
- 外置 sidecar profile。
- `INTERNAL_SERVICE_TOKEN` 获取、轮换和内嵌临时 token 规则。
- 健康检查。
- 日志字段。
- 回退策略。
- 常见错误。

验证：

```bash
npm run build:backend
npm run test -- --testPathPattern="operationalStatus|startupDiagnostics"
```

## 波次 8：扩展 network-tools

实施状态：已完成。已新增 Rust `/v1/network/ping`、`/v1/network/speed`、`/v1/network/dns`、`/v1/network/http-timing`、`/v1/network/tls-timing` 合同；Node `rustNetworkToolsClient` 已接入对应方法，公网 `ping` 和 `speedTest` 保持原响应包装并按 feature flag 使用 Rust 优先、外部 API 回退。

目标：把当前后端更多低层网络探测从 Node/外部 API 迁移到 Rust。

候选能力：

- `ping`：优先无特权实现；如 ICMP 权限不可用，返回明确错误或使用 TCP/HTTP 探测降级。
- `speedTest`：由 Rust 做请求计时、吞吐统计和结果归一化；Node 保留 API 包装和授权。
- DNS resolve：A、AAAA、CNAME、MX、TXT 等基础解析。
- HTTP timing：DNS、connect、TLS、TTFB、total timing。
- TLS timing：握手耗时、证书基础信息、过期时间。

目标接口：

```text
POST /v1/network/ping
POST /v1/network/speed
POST /v1/network/dns
POST /v1/network/http-timing
POST /v1/network/tls-timing
```

要求：

- 每个接口都限制目标、超时、响应大小和并发。
- 所有私网、loopback、link-local、multicast、保留地址限制沿用 `network-tools` 规则。
- Node controller 响应结构不变。

验证：

```bash
npm run test -- --testPathPattern="networkService|networkController|network-apis|rustNetworkToolsClient"
cargo test --manifest-path rust-services/Cargo.toml
npm run build:backend
```

## 波次 9：扩展 audio-worker

实施状态：已完成。已扩展 Rust 音频分析、magic bytes 校验、MP3 ID3 元数据清理和 operation 开关；Node 通过 `RUST_AUDIO_WORKER_OPERATIONS` 控制操作集合，默认仍为 `passthrough,analyze`，不改变 TTS 文件名、历史记录、WebSocket 或任务状态机。

目标：把音频二进制处理逐步移到 Rust。

候选能力：

- `flacToMp3`。
- 格式检测和 magic bytes 校验。
- duration、bitrate、sample rate、channels 分析。
- silence trim。
- loudness normalize。
- metadata cleanup。
- 转码和压缩。

要求：

- Rust 不生成音频，不调用 OpenAI，不决定 provider。
- Rust 不改变文件名规则、历史记录、WebSocket、任务状态机。
- 所有处理都必须可按 operation 开关启停。
- Rust 失败时可回退原始 buffer 或当前 Node 实现。

验证：

```bash
npm run test -- --testPathPattern="ttsRustAudioWorker|tts|flacToMp3"
cargo test --manifest-path rust-services/Cargo.toml
npm run build:backend
```

## 波次 10：file-worker / media-worker

实施状态：已完成。已新增 Rust `file-worker`、Node `rustFileWorkerClient.ts`、feature flag、embedded supervisor、Docker/Compose sidecar profile 和部署文档；第一版提供 magic MIME、hash、图片尺寸、JPEG EXIF 清理和 ZIP 风险检查，Node 仍保留上传权限、配额、接受/拒绝、存储和审计决策。

目标：把文件和媒体 bytes 密集处理移到 Rust。

候选能力：

- magic number MIME 检测。
- 文件 hash 和去重预处理。
- 大文件流式大小、类型和完整性校验。
- 图片尺寸探测。
- EXIF 清理。
- 图片压缩和 WebP 转换。
- 压缩包层级、解压后大小估算和 zip bomb 检查。

目标接口：

```text
GET  /healthz
POST /v1/file/inspect
POST /v1/file/hash
POST /v1/file/image/inspect
POST /v1/file/image/process
POST /v1/file/archive/inspect
```

Node 接入要求：

- 新增 `rustFileWorkerClient.ts`。
- Node 保留上传权限、用户配额、文件接受/拒绝、存储和审计决策。
- Rust 只返回检测结果或处理后的 bytes。

验证：

```bash
npm run test -- --testPathPattern="rustFileWorkerClient|upload|asset"
cargo test --manifest-path rust-services/Cargo.toml
npm run build:backend
```

## 波次 11：data-tools

目标：把大批量数据转换、解析和压缩任务移到 Rust。

候选能力：

- hash/base64 批处理。
- 字符编码检测和转换。
- CSV 清洗、切分、预校验。
- JSON 清洗、流式解析和 schema 前置校验。
- 大文本解析。
- gzip/zstd/deflate 压缩和解压缩。

目标接口：

```text
GET  /healthz
POST /v1/data/hash
POST /v1/data/base64
POST /v1/data/encoding/convert
POST /v1/data/csv/inspect
POST /v1/data/json/inspect
POST /v1/data/compress
POST /v1/data/decompress
```

Node 接入要求：

- 新增 `rustDataToolsClient.ts`。
- Rust 不读取业务数据库，不解释业务权限。
- Node 负责请求授权、业务字段含义、存储和最终响应。

验证：

```bash
npm run test -- --testPathPattern="rustDataToolsClient"
cargo test --manifest-path rust-services/Cargo.toml
npm run build:backend
```

## 波次 12：security-worker

目标：把安全边界明确的纯计算任务移到 Rust，策略和状态仍归 Node。

候选能力：

- PoW 校验。
- HMAC 计算和校验。
- AES-GCM 等 envelope 加解密纯计算。
- 请求特征纯函数风险评分。
- 内容规则和禁词扫描。

目标接口：

```text
GET  /healthz
POST /v1/security/pow/verify
POST /v1/security/hmac/verify
POST /v1/security/envelope/decrypt
POST /v1/security/risk/score
POST /v1/security/content/scan
```

边界：

- Node 保留 WAF、限流、封禁、放行、扣额度、管理员策略和审计落库。
- Rust 只返回计算结果、风险分、命中规则和可解释原因。
- Rust 不持久化安全状态，不读取用户表，不直接决定 HTTP 状态码。

验证：

```bash
npm run test -- --testPathPattern="rustSecurityWorkerClient|security|waf|rateLimit"
cargo test --manifest-path rust-services/Cargo.toml
npm run build:backend
```

## 波次 13：analytics-worker

目标：把离线聚合、日志扫描和报表生成中的重计算移到 Rust。

候选能力：

- 使用量聚合预处理。
- 大日志扫描。
- 导出报表生成。
- 离线路由审计计算。
- 离线安全审计计算。

目标接口：

```text
GET  /healthz
POST /v1/analytics/usage/aggregate
POST /v1/analytics/logs/scan
POST /v1/analytics/reports/render
POST /v1/analytics/audits/routes
POST /v1/analytics/audits/security
```

Node 接入要求：

- 新增 `rustAnalyticsWorkerClient.ts`。
- Node 负责管理员权限、任务创建、下载授权、审计记录和结果持久化。
- Rust 只处理输入数据并返回聚合结果或报表 bytes。

验证：

```bash
npm run test -- --testPathPattern="rustAnalyticsWorkerClient|analytics|audit|report"
cargo test --manifest-path rust-services/Cargo.toml
npm run build:backend
```

## 阶段清理预期

每个实现波次结束时必须完成：

- 删除临时调试文件和一次性测试脚本。
- 确认没有把 internal token、真实 API key 或本地路径写入代码、测试快照或文档。
- 确认 Rust 编译产物没有被提交。
- 确认 Docker 生成物、日志、音频测试输出没有被提交。
- 更新对应测试或文档，而不是留下未解释的 TODO。
- 用 `git status --short` 确认只包含计划内文件；如存在用户已有改动，提交时必须避开。

## 安全边界

- Rust 服务必须要求 `X-Internal-Token`。
- Rust 服务不信任 Node 输入，仍做二次校验。
- Rust 默认只监听 loopback 或容器内网，不映射公网端口。
- Rust `network-tools` 默认禁止扫描内网和 link-local 地址，除非显式配置允许。
- `portscan` 必须限制端口数量、并发和超时。
- Node 保持现有 `apiKeyAuth("network")` 和 OAuth `network` scope 认证。
- TTS 音频 worker 不接受远程 URL，避免 SSRF。
- Rust 错误不能回显内部路径、环境变量或 token。
- `security-worker` 只做纯计算，不执行业务封禁、限流或放行策略。

## 回滚规则

最快回滚：

```text
RUST_NETWORK_TOOLS_ENABLED=false
RUST_AUDIO_WORKER_ENABLED=false
RUST_EMBEDDED_SERVICES_ENABLED=false
```

单 worker 回滚：

```text
RUST_FILE_WORKER_ENABLED=false
RUST_DATA_TOOLS_ENABLED=false
RUST_SECURITY_WORKER_ENABLED=false
RUST_ANALYTICS_WORKER_ENABLED=false
```

代码回滚：

- 保留 Rust 文件不影响 Node。
- Node 适配层通过 feature flag 不被调用。
- 若部署异常，可只关闭内嵌 supervisor 或只关闭外置 sidecar profile。

数据回滚：

- Network sidecar 不写数据库，无数据回滚。
- Audio worker 不改变文件命名和 asset schema；若后续记录 metadata，必须保证字段可选。
- 后续 file/data/security/analytics worker 不直接写业务数据库。

## 验证总表

TypeScript：

```bash
npm run build:backend
npm run test -- --testPathPattern="networkService|networkController|network-apis"
npm run test -- --testPathPattern="internalServiceClient|rustNetworkToolsClient"
npm run test -- --testPathPattern="ttsRustAudioWorker|tts"
```

Rust：

```bash
cargo fmt --manifest-path rust-services/Cargo.toml --all --check
cargo test --manifest-path rust-services/Cargo.toml
```

Docker：

```bash
docker compose config
```

OpenAPI / route audit，如路由或文档生成逻辑变更：

```bash
npm run generate:openapi
npm run generate:route-audit
```

## 实施顺序建议

1. 先做 `network-tools` Rust 服务和合同测试。
2. 再做 Node `internalServiceClient` 和 `rustNetworkToolsClient`。
3. 接入 `NetworkService.tcpPing()` 和 `NetworkService.portScan()`。
4. 配 Docker、CI 和内嵌 Rust supervisor。
5. 线上灰度启用或确认生产默认 Rust 行为。
6. 稳定后做 `audio-worker` 合同。
7. 把 TTS 音频后处理接入 provider buffer 返回后、写磁盘和 Mongo asset 前。
8. 扩展 `network-tools` 到 `ping`、`speedTest`、DNS、HTTP timing、TLS timing。
9. 扩展 `audio-worker` 到转码、分析、静音裁剪、响度、元数据和压缩。
10. 做 `file-worker` / `media-worker`。
11. 做 `data-tools`。
12. 做 `security-worker`。
13. 做 `analytics-worker`。

## 完成条件

- 每个启用路径都有 feature flag。
- 每个 Rust 服务可独立测试。
- 每个 Node 适配层有单元测试。
- 当前公网 API 不变。
- 生产可以通过环境变量一键回退。
- Node 可以在生产 app 容器中唤醒和监管 Rust。
- 外置 sidecar 模式仍可选且需要共享 internal token。
- 文档说明部署、验证、回滚和安全限制。

## 交付验收计划

实现完成后，交付报告必须列出：

- 已完成的波次和对应提交。
- 实际修改的文件清单。
- Rust 服务的健康检查结果。
- Node 测试、Rust 测试、后端构建和 Docker Compose 检查结果。
- 未完成事项和是否影响生产启用。
- 回滚开关和默认值。

## 完成表述规则

- 只产出或更新本文档时，只能说“混合部署计划已更新”。
- 只有 network sidecar 接入、测试和部署配置完成后，才能说“Rust network-tools 混合部署已完成”。
- 只有 audio worker 接入、测试和部署配置完成后，才能说“Rust 音频处理混合部署已完成”。
- 只有某个后续 worker 的 Rust 合同、Node client、feature flag、fallback、测试和部署说明完成后，才能说该 worker 已完成。
- 未验证的性能收益只能表述为“预期收益”，不能表述为“已经提升”。
