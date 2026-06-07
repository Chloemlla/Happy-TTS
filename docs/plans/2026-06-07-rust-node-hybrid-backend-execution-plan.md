# Rust/Node 混合后端执行计划

日期：2026-06-07

## 内部执行等级

等级：XL

原因：该工作跨 Node 后端、Rust sidecar、Docker 部署、测试和文档。执行时应按波次推进，避免一次性改动认证、路由、TTS 队列和部署。

## 总体架构

```text
Frontend / third-party clients
  -> Node Express public API
     -> WAF / IP checks / JWT / API Key / OAuth / rate limit
     -> controllers
     -> TypeScript services
        -> Rust network-tools sidecar, optional
        -> Rust audio-worker sidecar, optional
     -> existing storage / queues / audit / WebSocket
```

Node 继续控制：

- 公网路由。
- 权限和计费。
- 参数归一化。
- 任务状态。
- 失败回退。
- 响应结构。

Rust 只处理：

- 已授权请求的具体网络探测。
- 已生成音频 buffer 的后处理。
- 可独立测试的 CPU/IO 密集能力。

## 目标文件结构

第一阶段新增：

```text
rust-services/
  Cargo.toml
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
        dns.rs
      tests/
        validation_tests.rs
```

第二阶段新增：

```text
rust-services/
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

Node 新增或修改：

```text
src/config/config.ts
src/services/internalServiceClient.ts
src/services/rustNetworkToolsClient.ts
src/services/rustAudioWorkerClient.ts
src/services/networkService.ts
src/controllers/networkController.ts
src/tts/tts.ports.ts
src/tts/tts.service.ts
src/tests/internalServiceClient.test.ts
src/tests/rustNetworkToolsClient.test.ts
src/tests/networkService.test.ts
src/tests/ttsRustAudioWorker.test.ts
```

部署和文档新增或修改：

```text
Dockerfile
docker-compose.yml
.dockerignore
package.json
docs/rust-node-hybrid-deployment.md
docs/synapse-oauth-integration.md
```

`docs/synapse-oauth-integration.md` 只在需要说明 OAuth `network` 或 `tts` scope 调用行为未变时补充，不重复写内部部署细节。

## 所有权边界

Node 所有权：

- `src/routes/*` 的公网路由和中间件顺序。
- `src/controllers/*` 的 HTTP 输入输出。
- `src/services/*` 的业务编排、鉴权后能力调用、错误映射。
- `src/tts/*` 的任务队列、状态、文件名、持久化、历史记录、WebSocket。
- `src/config/config.ts` 的环境变量解析和默认值。

Rust 所有权：

- `rust-services/network-tools/*` 的 TCP 探测、端口扫描和地址校验。
- `rust-services/audio-worker/*` 的音频 buffer 分析和后处理。
- Rust 内部 HTTP 合同、internal token 校验、超时和并发限制。

部署所有权：

- `Dockerfile` 和 `docker-compose.yml` 只负责构建与连接服务，不改变业务语义。
- `package.json` 只增加便捷脚本，不引入运行时行为变化。

文档所有权：

- `docs/rust-node-hybrid-deployment.md` 说明部署、配置、健康检查和回滚。
- 现有 OAuth 文档只说明 API scope 调用入口保持不变。

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

目标：实现独立 Rust 内网服务，但暂不接入 Node 业务。

新增文件：

- `rust-services/Cargo.toml`
- `rust-services/network-tools/Cargo.toml`
- `rust-services/network-tools/src/main.rs`
- `rust-services/network-tools/src/config.rs`
- `rust-services/network-tools/src/auth.rs`
- `rust-services/network-tools/src/error.rs`
- `rust-services/network-tools/src/http.rs`
- `rust-services/network-tools/src/models.rs`
- `rust-services/network-tools/src/validation.rs`
- `rust-services/network-tools/src/probes/mod.rs`
- `rust-services/network-tools/src/probes/tcping.rs`
- `rust-services/network-tools/src/probes/portscan.rs`
- `rust-services/network-tools/src/probes/dns.rs`
- `rust-services/network-tools/src/tests/validation_tests.rs`

推荐 Rust crate：

- `axum`：HTTP 服务。
- `tokio`：异步运行时。
- `serde` / `serde_json`：请求响应模型。
- `tower-http`：trace、timeout、request limit。
- `thiserror`：错误类型。
- `tracing` / `tracing-subscriber`：结构化日志。

内部接口：

```text
GET  /healthz
POST /v1/network/tcping
POST /v1/network/portscan
```

请求头：

```text
X-Internal-Token: <INTERNAL_SERVICE_TOKEN>
```

`POST /v1/network/tcping` 请求：

```json
{
  "address": "example.com",
  "port": 443,
  "timeoutMs": 3000
}
```

`POST /v1/network/tcping` 响应：

```json
{
  "success": true,
  "data": {
    "address": "example.com",
    "port": 443,
    "reachable": true,
    "latencyMs": 42,
    "source": "rust-network-tools"
  }
}
```

`POST /v1/network/portscan` 请求：

```json
{
  "address": "example.com",
  "ports": [80, 443],
  "timeoutMs": 3000,
  "concurrency": 32
}
```

限制：

- `timeoutMs` 默认 3000，最大 10000。
- `portscan` 最大端口数量第一版限制为 128。
- `concurrency` 最大 64。
- 禁止空地址、非法端口、明显危险的地址格式。
- 是否禁止内网地址由配置控制，默认生产禁止，开发允许。

验证：

```bash
cargo test --manifest-path rust-services/Cargo.toml
cargo run --manifest-path rust-services/network-tools/Cargo.toml
```

## 波次 2：Node 内部服务客户端

目标：Node 能安全、统一地调用 Rust sidecar。

新增文件：

- `src/services/internalServiceClient.ts`
- `src/services/rustNetworkToolsClient.ts`
- `src/tests/internalServiceClient.test.ts`
- `src/tests/rustNetworkToolsClient.test.ts`

修改文件：

- `src/config/config.ts`

新增环境变量：

```text
INTERNAL_SERVICE_TOKEN=
RUST_NETWORK_TOOLS_ENABLED=false
RUST_NETWORK_TOOLS_URL=http://127.0.0.1:4010
RUST_NETWORK_TOOLS_TIMEOUT_MS=5000
RUST_NETWORK_TOOLS_FALLBACK_ENABLED=true
RUST_NETWORK_TOOLS_BLOCK_PRIVATE_TARGETS=true
```

`src/config/config.ts` 修改点：

- 在 `envSchema` 增加上述变量。
- 在 `startupConfig` 或导出的 `config` 中增加 `rustServices.networkTools`。
- 默认关闭 `RUST_NETWORK_TOOLS_ENABLED`，避免部署未准备时改变生产行为。

`src/services/internalServiceClient.ts` 责任：

- 接收 base URL、internal token、timeout。
- 自动带 `X-Internal-Token`。
- 设置请求超时。
- 统一解析 JSON。
- 将 Rust 401/403/429/5xx 映射为内部错误。
- 暴露 `getHealth()` 和 `postJson()`。

`src/services/rustNetworkToolsClient.ts` 责任：

- 封装 `tcping()`、`portScan()`。
- 将 Node 当前输入模型转换为 Rust JSON。
- 将 Rust 响应转换为 `NetworkTestResponse`。
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

`src/services/networkService.ts` 修改点：

- `tcpPing()` 先检查 `config.rustServices.networkTools.enabled`。
- 启用时调用 `RustNetworkToolsClient.tcpPing()`。
- Rust 成功时直接返回当前 `NetworkTestResponse` 结构。
- Rust 失败时：
  - `fallbackEnabled=true`：记录 warning 并调用现有外部 API。
  - `fallbackEnabled=false`：返回明确错误。
- `portScan()` 使用同样策略。
- `ping()` 第一版不迁移 ICMP，可保持外部 API；如使用 TCP fallback，则明确文档说明。
- `speedTest()` 第一版保持现有外部 API。

`src/controllers/networkController.ts` 修改点：

- 原则上不改路由和响应结构。
- 只在需要时增加更明确的 502/503 错误映射。

验证：

```bash
npm run test -- --testPathPattern="networkService|networkController|network-apis"
npm run build:backend
```

手动检查：

```bash
curl "http://localhost:3000/api/network/tcping?address=example.com&port=443" -H "X-API-Key: <key>"
curl "http://localhost:3000/api/network/portscan?address=example.com" -H "X-API-Key: <key>"
```

## 波次 4：Docker 和部署

目标：生产可以以 sidecar 方式运行 Rust。

新增或修改文件：

- `Dockerfile`
- `docker-compose.yml`
- `.dockerignore`
- `package.json`
- `docs/rust-node-hybrid-deployment.md`

推荐实现：

1. 新增 `rust-network-tools` 构建阶段或独立 Dockerfile。
2. `docker-compose.yml` 增加 `network-tools` 服务。
3. `app` 服务通过容器服务名访问 `http://network-tools:4010`。
4. `INTERNAL_SERVICE_TOKEN` 同时注入 `app` 和 `network-tools`。
5. `network-tools` 不映射宿主公网端口，只在 Compose 网络内访问。

Compose 示例目标：

```yaml
services:
  app:
    environment:
      - RUST_NETWORK_TOOLS_ENABLED=${RUST_NETWORK_TOOLS_ENABLED:-false}
      - RUST_NETWORK_TOOLS_URL=http://network-tools:4010
      - INTERNAL_SERVICE_TOKEN=${INTERNAL_SERVICE_TOKEN}
    depends_on:
      - network-tools

  network-tools:
    build:
      context: .
      dockerfile: Dockerfile
      target: rust-network-tools-runtime
    environment:
      - RUST_BIND_ADDR=0.0.0.0:4010
      - INTERNAL_SERVICE_TOKEN=${INTERNAL_SERVICE_TOKEN}
    restart: unless-stopped
```

验证：

```bash
docker compose config
```

生产回滚：

```text
RUST_NETWORK_TOOLS_ENABLED=false
```

不需要删除 Rust 容器即可回退业务路径。

## 波次 5：Rust audio-worker 合同

目标：先定义音频处理合同，再接入 TTS。

新增文件：

- `rust-services/audio-worker/Cargo.toml`
- `rust-services/audio-worker/src/main.rs`
- `rust-services/audio-worker/src/config.rs`
- `rust-services/audio-worker/src/auth.rs`
- `rust-services/audio-worker/src/error.rs`
- `rust-services/audio-worker/src/http.rs`
- `rust-services/audio-worker/src/models.rs`
- `rust-services/audio-worker/src/processing/mod.rs`
- `rust-services/audio-worker/src/processing/analyze.rs`
- `rust-services/audio-worker/src/processing/normalize.rs`
- `rust-services/audio-worker/src/processing/passthrough.rs`
- `rust-services/audio-worker/src/tests/audio_contract_tests.rs`

内部接口：

```text
GET  /healthz
POST /v1/audio/process
```

请求建议使用 multipart：

```text
file=<audio bytes>
outputFormat=mp3
taskId=tts_xxx
contentHash=...
operations=["analyze","normalize"]
```

响应：

```json
{
  "success": true,
  "data": {
    "outputFormat": "mp3",
    "durationMs": 1234,
    "size": 45678,
    "loudness": {
      "integratedLufs": -16.0
    },
    "audioBase64": "<processed bytes>",
    "source": "rust-audio-worker"
  }
}
```

第一版操作：

- `passthrough`：合同验证和大小限制，不改变音频。
- `analyze`：返回大小、格式、可选时长。
- `normalize`：仅在依赖和部署成熟后启用。

限制：

- 最大输入大小默认 20MB。
- 超时默认 30 秒。
- 不接受 URL 输入，只接受 Node 已持有的 buffer。
- Rust 不写数据库、不决定文件名、不发送 WebSocket。

验证：

```bash
cargo test --manifest-path rust-services/Cargo.toml
```

## 波次 6：接入 TTS 音频后处理

目标：在不改变 TTS 任务状态机的情况下，插入可选后处理。

新增文件：

- `src/services/rustAudioWorkerClient.ts`
- `src/tests/ttsRustAudioWorker.test.ts`

修改文件：

- `src/config/config.ts`
- `src/tts/tts.ports.ts`
- `src/tts/tts.service.ts`
- `src/tts/tts.storage.ts`，仅当需要记录音频处理元数据时修改。
- `src/tests/tts*.test.ts`，按现有测试覆盖生成结果。

新增环境变量：

```text
RUST_AUDIO_WORKER_ENABLED=false
RUST_AUDIO_WORKER_URL=http://127.0.0.1:4020
RUST_AUDIO_WORKER_TIMEOUT_MS=30000
RUST_AUDIO_WORKER_MAX_BYTES=20971520
RUST_AUDIO_WORKER_FALLBACK_ENABLED=true
```

`src/tts/tts.service.ts` 接入点：

当前代码：

```ts
const response = await this.requestSpeechWithRetry(request, safeOutputFormat);
await fs.promises.writeFile(filePath, response.audioBuffer);
await ttsAudioAssetStore.persistAudioAsset({ buffer: response.audioBuffer, ... });
```

目标改为：

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

建议新增内部抽象：

```text
src/tts/tts.audioPostProcessor.ts
```

责任：

- 未启用 Rust 时直接 passthrough。
- 启用 Rust 时调用 `RustAudioWorkerClient`。
- Rust 失败且 fallback 开启时回退原始 buffer。
- 记录处理来源和元数据。

`src/tts/tts.ports.ts` 增加：

```ts
export interface TtsAudioPostProcessInput {
  audioBuffer: Buffer;
  outputFormat: string;
  taskId?: string;
  contentHash: string;
}

export interface TtsAudioPostProcessResult {
  audioBuffer: Buffer;
  outputFormat: string;
  metadata?: Record<string, unknown>;
  source: "node-passthrough" | "rust-audio-worker";
}
```

验证：

```bash
npm run test -- --testPathPattern="ttsRustAudioWorker|tts"
npm run build:backend
```

## 波次 7：文档、观测和运维

新增或修改文件：

- `docs/rust-node-hybrid-deployment.md`
- `docs/backend-optimization-draft.md`
- `docs/generated/route-governance.md`，仅当生成脚本更新输出。
- `src/config/startupDiagnostics.ts`
- `src/services/operationalStatusService.ts`，如需要把 Rust health 暴露给管理诊断。

内容：

- 环境变量说明。
- Docker Compose 示例。
- 本地开发启动方式。
- 健康检查。
- 日志字段。
- 回退策略。
- 常见错误。

建议增加启动诊断：

- Rust network enabled 但 URL 为空：启动时报 warning。
- Internal token 为空且 Rust enabled：生产环境报错，开发环境 warning。
- Rust health check 失败：记录 warning，不阻断 Node 启动，除非配置要求强制。

验证：

```bash
npm run build:backend
npm run test -- --testPathPattern="operationalStatus|startupDiagnostics"
```

## 阶段清理预期

每个实现波次结束时必须完成：

- 删除临时调试文件和一次性测试脚本。
- 确认没有把 internal token、真实 API key 或本地路径写入代码、测试快照或文档。
- 确认 Rust 编译产物没有被提交。
- 确认 Docker 生成物、日志、音频测试输出没有被提交。
- 更新对应测试或文档，而不是留下未解释的 TODO。
- 用 `git status --short` 确认只包含计划内文件。

## 安全边界

- Rust 服务必须要求 `X-Internal-Token`。
- Rust 服务不信任 Node 输入，仍做二次校验。
- Rust `network-tools` 默认禁止扫描内网和 link-local 地址，除非显式配置允许。
- `portscan` 必须限制端口数量、并发和超时。
- Node 保持现有 `apiKeyAuth("network")` 和 OAuth `network` scope 认证。
- TTS 音频 worker 不接受远程 URL，避免 SSRF。
- Rust 错误不能回显内部路径、环境变量或 token。

## 回滚规则

最快回滚：

```text
RUST_NETWORK_TOOLS_ENABLED=false
RUST_AUDIO_WORKER_ENABLED=false
```

代码回滚：

- 保留 Rust 文件不影响 Node。
- Node 适配层通过 feature flag 不被调用。
- 若部署异常，只回滚 Docker Compose 中 sidecar 服务即可。

数据回滚：

- Network sidecar 不写数据库，无数据回滚。
- Audio worker 第一版不改变文件命名和 asset schema；若后续记录 metadata，必须保证字段可选。

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
4. 配 Docker Compose，跑本地 sidecar。
5. 线上灰度启用 `RUST_NETWORK_TOOLS_ENABLED=true`。
6. 稳定后再做 `audio-worker` 合同。
7. 最后把 TTS 音频后处理接入 `TtsService.generateSpeech()`。

## 完成条件

- 计划中所有启用路径都有 feature flag。
- Rust 服务可独立测试。
- Node 适配层有单元测试。
- 当前公网 API 不变。
- 生产可以通过环境变量一键回退。
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

- 只产出本文档时，只能说“混合部署计划已产出”。
- 只有 network sidecar 接入、测试和部署配置完成后，才能说“Rust network-tools 混合部署已完成”。
- 只有 audio worker 接入、测试和部署配置完成后，才能说“Rust 音频处理混合部署已完成”。
- 未验证的性能收益只能表述为“预期收益”，不能表述为“已经提升”。
