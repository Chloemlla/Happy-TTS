# 语音转文本 · 实施方案与任务清单

> 方法论：`verified-methodology.md`（禁本地构建、签名提交、CI 唯一裁判、单文件 ≤800 行）
> 本文件只描述功能与改动范围；识别链路的实现细节不在这里展开，也不对外文案里出现。

## 范围（已与用户确认）

1. 补齐既有转写实现缺少的能力：断点续传、上传重试、分片并发、任务内多文件并发
2. 「支持有无时间线」= 前端展示分段 + API 返回 segments + 新增「带时间线 txt」；产物三种都可选，默认纯文本
3. 外部参考资料不进本仓库
4. 后端 + 前端一起改；页面叫「语音转文本」，列入核心功能，普通登录用户可用（新建用户页）
5. 配置面：能写死的尽量写死；环境变量走 `frontend/src/components/env-manager`

## 现状差距（Synapse `src/mediaTool/`）

| # | 项 | 改动前 | 改动后 | 编号 |
|---|---|---|---|---|
| 1 | 断点续传 | 无：每次新建会话，重试=整文件重传 | 会话与已传片号记在音频同名 sidecar，按 size/mtime/片数判失效，从缺口继续 | T-01 |
| 2 | 分片并发上传 | 无（逐片串行） | worker 池 + 连续水位双轨记录 | T-02 |
| 3 | 单片重试 | 无（失败即整链重来一次） | 指数退避重试，瞬时错误码视为成功，非 JSON/网络异常也进重试 | T-03 |
| 4 | 多文件并发 | 无（任务内串行） | 文件级 worker 池，单文件失败不拖垮整批，取消仍整链中断 | T-04 |
| 5 | 产物形态 | 纯文本 + 可选字幕 | 纯文本 / 带时间线文本 / 字幕三选，另恒写分段 JSON | T-05 |
| 6 | 时间线文本 | 无 | `.timed.txt`，每行 `[mm:ss → mm:ss]`（超一小时补时位） | T-06 |
| 7 | segments 出参 | API 只给段落数 | `GET .../jobs/:id` 返回 `transcripts[].segments` | T-07 |
| 8 | 用户入口 | 仅 `/admin/media-tool`（requireAdmin + adminLimiter） | 新增 `/transcribe` + `/api/transcribe`，登录即用，作用域锁 `workDir/users/<uid>` | T-08 |
| 9 | 配置项 | 只在代码里读，无 UI、无 `.env.example` | 只保留 10 个「换机器就得改」的环境变量 + env-manager 面板 + `.env.example` 段 | T-09 |
| 10 | 生效优先级 | 数据库快照恒覆盖环境变量（改环境变量看起来没反应） | 显式写了值的环境变量为最终权威，其余走设置页 | T-10 |

## 追加约束

- **C-01「能写死尽量写死」**：环境变量只留 `MEDIA_TOOL_DISABLED` / `_WORK_DIR` / `_DOWNLOAD_DIR` / `_LASR_URL` / `_APP_ID` / `_APP_KEY` / `_VIVO_TOKEN` / `_VIVO_OPENID` / `_YTDLP` / `_COOKIES`。语种、场景、默认产物、文件/分片并发、单片重试、续传、上传上限、用户页限额一律写在 `src/mediaTool/types.ts` 默认值里，微调走「媒体工具 → 设置」（存数据库）。`ENV_READ_WHITELIST`、`MediaToolConfigSection`、`.env.example` 三处同步，只列这 10 项，不留「配了不生效」的假入口。
- **C-02「默认值照既有脚本写死」**：文件并发 3、分片串行上传、单片重试 4 次（退避 `min(15s, 1000·2ⁿ⁻¹)`）、5MB 分片、500MB 上限、默认产物纯文本、轮询间隔 3s、请求超时 60s。
- **C-03「不要在公开场合标明技术原理」**：用户页文案、管理端标签、env-manager 说明、README、`.env.example` 均只讲能力（长录音、续跑、三种产物、按用户隔离、限额可配），不写引擎来源、协议、签名方式、错误码等实现细节。

## 改动清单

### 后端

- `src/mediaTool/types.ts` — `TranscribeOutput` + 归一/解析函数（T-05/06）、`LasrOptions.uploadConcurrency|uploadRetries|resumeEnabled|outputs`（T-01/02/03）、`TranscribeUserSettings`（T-08）、`MediaJobRecord.scope|ownerId`、`MediaJobParams.outputs`、`MediaJobFileItem.timedFile|srtFile|jsonFile|durationSec`（T-07）、`explicitEnvLayer()`（T-09/10）
- `src/mediaTool/lasrSession.ts` **（新）** — sidecar 会话（T-01）、分片 worker 池（T-02）、单片退避重试（T-03）、取消哨兵
- `src/mediaTool/lasrTransport.ts` **（新）** — 从 `vivoLasr.ts` 拆出的编码/签名/请求层，避免与会话模块互相 import 成环
- `src/mediaTool/vivoLasr.ts` — 复用/作废会话（T-01）、三态产物 + 恒写分段 JSON（T-05/06/07）、`LasrOutcome` 扩展
- `src/mediaTool/jobs/mediaJobRunner.ts` — 文件级并发（T-04）、产物解析（T-05/06）、结果项带 timed/srt/json 与时长（T-07）、进度单调不回跳
- `src/mediaTool/jobs/mediaJobStore.ts` — `list(limit, owner)` 归属过滤（T-08）
- `src/mediaTool/settingsStore.ts` — `user` 块合并 + 环境变量显式层覆盖（T-10）
- `src/mediaTool/serverRuntime.ts` **（新）** — store/settings/runner 单例与重启自恢复；两类入口共用一个 runner，否则重启会把同一条 queued 任务入队两次（重复上传、重复转写）
- `src/mediaTool/http/transcribeUserHttp.ts` **（新）** — 用户态 API：config / upload / files / jobs CRUD / 结果 segments / 产物下载（T-07/08）
- `src/routes/transcribeRoutes.ts` **（新）** + `postTamperModules.ts` 注册 `/api/transcribe`（authenticateToken + transcribeLimiter，`authPolicy/rateLimitPolicy` 均 mode=mount）
- `src/routes/mediaToolRoutes.ts` — 改用 serverRuntime 单例
- `src/middleware/routeLimiters.ts`、`routeModules/knownMiddleware.ts` — 新增并登记 `transcribeLimiter`（T-08）
- `src/models/mediaToolModels.ts` — `scope`/`ownerId` 字段 + `{scope, ownerId, createdAt}` 索引（T-08）
- `src/controllers/adminController.ts` — `ENV_READ_WHITELIST` 增那 10 项（否则面板恒显「未设置」）
- `.env.example` — 仅那 10 项 + 中性说明（T-09 + C-01/C-03）

### 前端

- `frontend/src/api/transcribe.ts` **（新）** — 用户态客户端（T-07/08）
- `frontend/src/components/speech-to-text/SpeechToTextPage.tsx` **（新）** — 用户页（T-08）
- `frontend/src/components/speech-to-text/TranscriptView.tsx` **（新）** — 「有/无时间线」两种视图 + 复制/下载（T-05/06/07）
- `frontend/src/App.tsx` — 懒加载路由 `/transcribe` + 标题/描述；`navConfig.ts` — 核心功能组新增「语音转文本」（首页卡片与侧边栏同一份 SSOT）
- `frontend/src/components/env-manager/MediaToolConfigSection.tsx` + `SelfContained...` **（新）** + `EnvManager.tsx` 注册（T-09）
- `frontend/src/api/mediaTool.ts`、`admin/media-tool/{TranscribePanel,SettingsPanel,JobsPanel,BiliPanel}.tsx`、`admin/MediaToolAdmin.tsx` — 产物三选、新参数、分段展示、中性文案（T-02/03/05/07/09 + C-03）

### 文档

- `readme.md`：TTS 段下新增「语音转文本」小节，只写能力与模块位置（C-03）

## 判据与风险

- 不新增依赖、不动锁文件；新文件均 ≤800 行；`postTamperModules.ts` 控制在 800 行内
- 不本地构建/测试；提交 `-S` 且 `git log -1 --format=%G?` 为 `G`；push 带 `GIT_TERMINAL_PROMPT=0`；`gh` 显式带仓库
- CI 门禁：`build`、`type-check-backend`、`type-check-frontend`、`check:openapi-drift`、`smoke:obfuscated`（启动即跑 `assertRouteGovernance`）、`check:ts-file-size`、`check:frontend-bundle`、CodeQL
- 与另一路并行会话（studioTheme / InfoQueryScaffold 收敛）在同一条 main 上交错：只显式 `git add` 本次文件；相交的 `EnvManager.tsx` 按用户要求一并提交
- 遗留风险（已知未做）：用户页轮询用「我的任务」列表接口，管理端 JobsPanel 仍 2.5s 全量轮询，两档限速分开

## 收尾核对（编号 → 去向）

| 编号 | 去向 |
|---|---|
| T-01 / T-02 / T-03 | `lasrSession.ts` + `vivoLasr.ts`，已提交 |
| T-04 / T-05 / T-06 / T-07 | `mediaJobRunner.ts`、`vivoLasr.ts`、`transcribeUserHttp.ts`、`mediaToolHttp.ts`，已提交 |
| T-08 | `/transcribe` 页 + `/api/transcribe` + 归属过滤/索引 + 核心功能位，已提交 |
| T-09 / T-10 | 10 项环境变量 + env-manager 面板 + `explicitEnvLayer()`，已提交 |
| C-01 / C-02 | `types.ts` 默认值钉死；白名单/面板/`.env.example` 同步收窄，已提交 |
| C-03 | UI 文案、README、`.env.example`、新增注释去原理化，已提交 |
| 上传收不到文件 | axios 默认头把 FormData 序列成 JSON → 显式 `multipart/form-data`（用户页 + 管理端），已提交 |
| 前端 4 处 type-check 失败 | 重复标识符 / 默认设置缺字段 / NumInput 无 hint prop，已提交 |
