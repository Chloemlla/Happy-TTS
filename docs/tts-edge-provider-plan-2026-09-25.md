# 内置微软语音（Edge Read Aloud）TTS 提供商 — 设计与落地清单（2026-09-25）

## 1. 目标与已定决策

在 Synapse 新增第三个可选 TTS 提供商「内置微软语音」，直接对接微软 Edge 朗读接口
（`speech.platform.bing.com/.../readaloud/edge/v1`），不依赖任何第三方中转。

| 决策点 | 结论 | 理由 |
|---|---|---|
| 上游接法 | **直连微软 Edge 朗读接口** | 真内置：无第三方依赖、无每日配额；不走 `api.ai.xmisp.com` 中转 |
| 音色清单 | **内置快照 + 可刷新增量** | 静态快照兜底（无外网也能选音色），管理员可一键拉取上游列表覆盖 |
| 默认行为 | **新增可选 provider，默认不动** | 现有 `openai` / `fish` 分支必须逐字节保持原有语义，回归面最小 |

协议与常量来源：`aitts-rev/decompiled/TTS.Base/TTS.Base.TTS.Edge/`
（`Constants.cs` / `Drm.cs` / `Voice.cs` / `Voices.cs` / `Communicate.cs`）。

## 2. 协议事实（已从反编译源提取，非猜测）

### 2.1 连接

```
wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1
  ?TrustedClientToken=6A5AA1D4EAFF4E9FB37E23D68491D6F4
  &ConnectionId=<32位小写guid无连字符>
  &Sec-MS-GEC=<SHA256大写十六进制>
  &Sec-MS-GEC-Version=1-143.0.3650.75
```

握手头：`Pragma: no-cache`、`Cache-Control: no-cache`、
`Origin: chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold`、
`User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36 Edg/143.0.0.0`、
`Accept-Language: en-US,en;q=0.9`、`Cookie: muid=<32位大写十六进制>;`

### 2.2 `Sec-MS-GEC`

```
windowsEpochSeconds = floor(unixSeconds + 11644473600)
aligned = floor(windowsEpochSeconds / 300) * 300      // 5 分钟对齐
ticks   = aligned * 10_000_000                         // F0 定点，无科学计数法
token   = SHA256_HEX_UPPER(ticks + TrustedClientToken)
```

### 2.3 两条发送消息

1. `Path:speech.config`（`Content-Type: application/json; charset=utf-8`）
   ```json
   {"context":{"synthesis":{"audio":{"metadataOptions":{"sentenceBoundaryEnabled":"false","wordBoundaryEnabled":"false"},"outputFormat":"audio-24khz-48kbitrate-mono-mp3"},"language":{"autoDetection":false}}}}
   ```
2. `Path:ssml`（`Content-Type: application/ssml+xml`，`X-RequestId` = 另生成一个 guidN）
   ```xml
   <speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='zh-CN'>
     <voice name='zh-CN-XiaoxiaoNeural'><prosody rate='+0%'>文本</prosody></voice>
   </speak>
   ```
   `X-Timestamp` 格式：speech.config 用 `ddd MMM dd yyyy HH:mm:ss 'GMT+0000 (Coordinated Universal Time)'`（本地拼接，无 `Z`）；
   ssml 用同一格式但末尾带 `Z`。

### 2.4 接收帧

- 文本帧：`headers\r\n\r\nbody`，按 `Path` 分发（`response` / `turn.start` / `audio.metadata` / `turn.end`）。
- 二进制帧：`[0..1]` 大端头长度，随后头文本，再随后音频负载。
- 音频判定：`Path: audio`，或缺失 `Path` 且 `Content-Type` 以 `audio/mpeg` 开头。
- `turn.end` 结束一轮；收到但无音频 → 视为失败。
- 403：拉一次音色列表读其 `Date` 头做时钟偏移矫正，再重连，最多 3 次。

### 2.5 音色列表

```
GET https://speech.platform.bing.com/consumer/speech/synthesize/readaloud/voices/list
  ?trustedclienttoken=6A5AA1D4EAFF4E9FB37E23D68491D6F4
  &Sec-MS-GEC=...&Sec-MS-GEC-Version=1-143.0.3650.75
```
字段：`Name` / `ShortName` / `Gender` / `Locale` / `SuggestedCodec` / `FriendlyName` / `Status` / `VoiceTag.ContentCategories` / `VoiceTag.VoicePersonalities`。

**内置快照的来源（2026-09-25 实测后修正）**：最初打算直接用 `aitts-rev/har/voices.zh-CN.json`（74 条）
与 `voices.en-US.json`（79 条）合成 153 条快照。实测发现**这条路会埋雷**：把 har 快照的 153 条 ShortName
逐条与上游实时列表比对，有 **110 条上游已经不存在**（上游当时共 322 条音色 / 142 个 locale，
zh-CN 只剩 6 条、en-US 只剩 17 条）。若拿 har 快照当内置清单，绝大多数音色会在合成阶段直接失败。

因此内置快照改为**从上游实时列表重建**：取全部 `zh*` / `en*` 的 GA 音色，共 **61 条**（14 个中文 + 47 个英文），
显示名优先沿用 har 里能对上的中文名，否则由 ShortName 推导。生成脚本在仓库外的 scratch 目录，
产物 `src/tts/edge/edge.voices.snapshot.ts` 标注「由脚本生成，请勿手工编辑」。

## 3. 落地清单

### 3.1 新增文件

| 文件 | 内容 |
|---|---|
| `src/tts/edge/edge.protocol.ts` | 协议常量、握手头常量、音色 ID 形状校验 `isEdgeVoiceId`、`formatEdgeTimestamp`、`toEdgeProsodyRate`、`splitEdgeText`、两条发送消息构造器、音色列表 URL |
| `src/tts/edge/edge.drm.ts` | `generateEdgeMuid()`、`generateEdgeSecMsGec(now, skewSeconds)`、`parseEdgeClockSkewSeconds(dateHeader, now)` |
| `src/tts/edge/edge.client.ts` | `EdgeTtsClient.synthesize()`（WSS 单轮合成、二进制帧解析、403 时钟矫正后重试）、`fetchVoiceCatalog()` |
| `src/tts/edge/edge.voices.ts` | `normalizeEdgeVoiceCatalog()`（上游列表 → `TtsProviderOption[]`）、`resolveEdgeVoiceOptions()`（刷新结果优先，否则回落快照） |
| `src/tts/edge/edge.voices.snapshot.ts` | 由上游实时列表生成的 61 条内置快照（机器生成，勿手改） |
| `src/tts/tts.edge-provider.ts` | `EdgeTtsProvider implements TtsProvider`：分块合成 + 非首块剥离 ID3v2 + `assertAudioResponse` |

模块依赖方向刻意保持单向：`config/ttsProviderConfig.ts` 只依赖两个叶子模块
（`edge.protocol.ts` 仅 import `crypto`、`edge.voices.snapshot.ts` 无 import），
`edge.voices.ts` 对 config 的 import 是 `import type`（编译期擦除），因此不会形成 config ↔ tts 循环。

### 3.2 修改文件

| 文件 | 改动 |
|---|---|
| `src/config/ttsProviderConfig.ts` | `TtsProviderId` 加 `"edge"`；`edge` 运行时配置段；`normalize` / `merge` / `public` / `snapshot` 四个构造器加 edge 分支 |
| `src/tts/tts.provider-router.ts` | 构造默认列表加 `EdgeTtsProvider`；冻结快照的准入条件从硬编码 id 白名单改为 `this.providers.has(providerId)`（语义等价，且以后新增提供商不用再改这行） |
| `src/tts/tts.readiness.ts` | 能力清单加 `edge` 条目（无需密钥，`configured` = 默认音色非空） |
| `src/tts/tts.pipeline.ts` | 输出格式闸门加 edge 分支（仅 mp3） |
| `src/tts/tts.storage.ts` | 任务记录 schema 里 `providerExecution.providerId` 的 Mongoose `enum` 补 `"edge"`（**漏掉会让 edge 任务在落库时校验失败**） |
| `src/routes/healthRoutes.ts` | 能力清单读取失败时的兜底数组补 edge 条目 |
| `src/config/runtimeConfigDefaults.ts` | ttsProvider 默认值加 edge 段；克隆函数深拷贝 `edge.voices` |
| `src/services/runtimeConfigService.ts` | admin 视图加 edge 字段；新增 `setEdgeVoiceCatalog()`（音色清单只由它写） |
| `src/controllers/ttsProviderController.ts` | 新增 `refreshEdgeVoices` |
| `src/routes/admin/config.ts` | `POST /tts/provider/edge-voices/refresh`（`/api/admin` 已在挂载点限流，沿用同样注释约定） |
| `frontend/src/types/tts.ts` | `TtsProviderId` 加 `"edge"` |
| `frontend/src/utils/ttsProviderConfig.ts` | 镜像：`EDGE_TTS_OUTPUT_FORMATS`、`normalizeProvider`、`getTtsOutputFormats`、`supportsTtsSpeed` |
| `frontend/src/components/env-manager/api.ts` | 新增 `TTS_EDGE_VOICES_REFRESH_API` |
| `frontend/src/components/env-manager/types.ts` | admin 配置加 edge 段 |
| `frontend/src/components/env-manager/TtsProviderConfigSection.tsx` | 提供商下拉加「微软语音」；edge 面板（上游地址、默认音色、刷新音色按钮） |
| `frontend/src/components/TTSForm.tsx` | edge 走 `voiceMode: "select"`，音色多时按语言筛选展示 |

### 3.3 明确不改

`src/tts/tts.service.ts` 的 `resolveSpeed` 只对 `fish` 强制归 1；edge 走用户设定速度（映射为 SSML prosody rate），无需改动。
`openai` / `fish` 的所有既有分支、默认值、错误文案保持不变。

## 4. 分块与拼接（关键实现约束）

Edge 朗读接口对超长单轮请求会提前断流（社区已知 ~10 分钟音频上限），而 Synapse 管线允许 4096 字符，
中文 4096 字 ≈ 13 分钟音频，**会触发截断**。因此：

- 按标点切成 ≤ 1500 字符的块（句末标点优先，退化为逗号，再退化为硬切）。
- 每块独立建一条 WSS 连接、单轮合成，块级失败可单独重试。
- 输出 MP3 帧直接拼接；**非首块剥离前导 ID3v2 标签**（`ID3` + syncsafe 长度），避免播放器在块边界误判。
- 块边界落在句末，编码器延迟引入的 ~30ms 间隙可忽略。

## 5. 验证策略

- 协议正确性无法由 CI 覆盖（CI 无外网、无真实上游）。用**仓库外** scratch 脚本（复用仓库既有 `ws` 依赖）
  对真实 `speech.platform.bing.com` 做一次握手 + 合成 + 音色列表探测，确认 `Sec-MS-GEC` 被接受、音频帧可解析。
- 全部编译 / 测试 / lint 只由 GitHub Actions 执行（方法论 §一-1）。
- **CI 判据的实情（本次核查后记录，避免误判）：** `.github/workflows/tsc.yml`（workflow 名 `Node Verification`）
  里 `Run backend Jest tests with coverage` 与 `Run frontend Vitest tests with coverage` 两个 step 都是
  `continue-on-error: true`，且处于**已知失败**状态（后端 ts-jest × typescript@7 不兼容；前端缺
  `@vitest/coverage-istanbul`）。因此单测**不构成闸门**，不能拿"CI 绿"当"单测通过"的证据。
  真正的闸门是：`check:audit-policies`、`pnpm run build`（后端 `tsc && copy-templates && obfuscate && copy-obfuscated-payload`，
  前端 `pnpm install --frozen-lockfile --ignore-scripts && tsc && vite build`）、`generate:openapi`、
  `check:openapi-drift`、`smoke:obfuscated`、`check:tree-shaking-config`，外加 job 级的
  `npx tsc --noEmit --project tsconfig.json` 与 `pnpm --dir frontend run typecheck`。
  注意 `tsconfig.json` **排除** `src/tests` 与 `**/*.test.ts`，而 `frontend/tsconfig.json` **包含** `src/**/*`，
  所以前端测试文件的类型错误会真闸门拦截、后端不会。
- 单测覆盖：`Sec-MS-GEC` 计算向量、时钟偏移解析、分块边界、prosody rate 映射、二进制帧解析、错误映射、
  edge 格式闸门、provider 路由选择。
