# 语音转文本（内嵌 transcribe.js）实施方案

> 来源：`F:\Repositories\GitHub\luyinji-rev\transcribe.js`（2026-09-13 版）
> 方法论：`F:\Repositories\GitHub\verified-methodology.md`（禁本地构建、签名提交、CI 唯一裁判、不写超级文件 ≤800 行）
> 已确认范围（用户回答）：
> 1. 补齐 transcribe.js 全部新增能力（断点续传 / 上传重试 / 分片并发 / 批量并发）
> 2. 「支持有无时间线」= 前端展示分段 + API 返回 segments + 新增「带时间线 txt」；产物三种都可选，默认纯文本
> 3. `luyinji-rev/docs` 逆向文档**不进** Synapse
> 4. 后端 + 前端一起改；页面叫「语音转文本」，**列入核心功能**，普通登录用户可用（新建用户页，不再只挂 /admin）
> 5. 环境变量通过 `frontend/src/components/env-manager` 管理（补 .env.example 说明）

## 现状差距（Synapse `src/mediaTool/` vs transcribe.js）

| # | 项 | Synapse 现状 | transcribe.js | 编号 |
|---|---|---|---|---|
| 1 | 断点续传 | 无（每次 create 新会话，重跑=整文件重传） | `<音频>.transcribe.json` 记 audio_id + 已传片；按 size/mtime/sliceNum 判失效 | T-01 |
| 2 | 分片并发上传 | 无（`for` 逐片串行） | `UPLOAD_CONCURRENCY` worker 池 + `uploadedSet`/连续水位双轨 | T-02 |
| 3 | 单片重试 | 无（失败即整链重来一次） | `UPLOAD_RETRIES` 指数退避 ≤15s，网络异常/非 JSON 也进重试，code 20005 视为成功 | T-03 |
| 4 | 多文件并发 | 无（job 内文件串行） | `CONCURRENCY` 文件级 worker 池 + `[i/N]` 标签日志 | T-04 |
| 5 | 输出形态 | 纯 `.txt` + 可选 `.srt`；分段只落 `result.length` 计数 | 纯文本；分段（bg/ed/speaker）在内存里打印 | T-05 |
| 6 | 时间线 txt | 无 | 无（脚本只有 console 打印） | T-06 |
| 7 | segments 出参 | API 不返回 | — | T-07 |
| 8 | 普通用户入口 | 仅 `/admin/media-tool`（requireAdmin + adminLimiter） | — | T-08 |
| 9 | 配置项 | `MEDIA_TOOL_*` 只在代码里读，无 UI、无 .env.example | 环境变量集合 | T-09 |
| 10 | 设置生效优先级 | Mongo 快照恒覆盖 env（`mergeDefaults`）→ 环境变量改了「看起来没反应」 | — | T-10 |

## 追加的用户约束（开工后两次纠正）

- **C-01 「MEDIA_TOOL_ 能写死尽量写死」**：环境变量只保留「换机器就得改」的 10 项
  `MEDIA_TOOL_DISABLED` / `_WORK_DIR` / `_LASR_URL` / `_APP_ID` / `_APP_KEY` / `_VIVO_TOKEN` / `_VIVO_OPENID` / `_YTDLP` / `_COOKIES` / `_DOWNLOAD_DIR`；
  其余（语种/场景/默认产物/文件并发/分片并发/单片重试/续传/上传上限/用户页限额/B站下载选项）全部写死在 `types.ts`，
  微调走「媒体工具 → 设置」（存库）。env-manager 面板、`.env.example`、`ENV_READ_WHITELIST` 同步只列这 10 项。
- **C-02 「按 transcribe.js 的写死」**：硬编码默认值逐项对齐 transcribe.js 的 `CONFIG`：
  `concurrency=3`（原 Synapse 为 2）、`uploadConcurrency=1`、`uploadRetries=4`、5MB 分片、500MB 上限、
  `zh-Hans-CN` / `user` / 默认不出 srt、设备参数（vivo/V2309A/PD2243/14/13/1.7.3.9/5.2.5.66/net=1/vaid 全 0）、
  code 20005 视为上传成功、重试退避 `min(15000, 1000*2^(n-1))`、轮询间隔 3s、请求超时 60s。

## 改动清单（按编号追溯）

### 后端

- `src/mediaTool/types.ts` — `TranscribeOutput`/`normalizeTranscribeOutputs`（T-05/06）、`LasrOptions.uploadConcurrency|uploadRetries|resumeEnabled|outputs`（T-02/03/01）、`MediaToolSettings.user`（T-08）、新 env 键 + `explicitEnvLayer()`（T-09/10）、`MediaJobRecord.scope|ownerId`、`MediaJobParams.outputs`、`MediaJobFileItem.timedFile|srtFile|jsonFile|durationSec`（T-07）
- `src/mediaTool/lasrSession.ts` **（新）** — 会话 sidecar（T-01）+ 分片并发上传 worker 池（T-02）+ 单片指数退避重试（T-03）+ 取消哨兵
- `src/mediaTool/vivoLasr.ts` — 复用/作废续传会话（T-01）、产物落盘三态 + 始终写 `.json` 分段（T-05/06/07）、`LasrOutcome` 扩展
- `src/mediaTool/jobs/mediaJobRunner.ts` — 文件级 worker 池（T-04）、产物解析（T-05/06）、结果项带 timed/srt/json 与时长（T-07）
- `src/mediaTool/jobs/mediaJobStore.ts` — `list(limit, owner)` 按作用域过滤（T-08）
- `src/mediaTool/settingsStore.ts` — 新字段合并 + env 显式层覆盖（T-10）+ `user` 块
- `src/mediaTool/serverRuntime.ts` **（新）** — server 态单例（store/settings/runner）与重启自恢复，供 admin 与用户两条路由共用，避免两个 runner 重复入队（T-08）
- `src/mediaTool/http/transcribeUserHttp.ts` **（新）** — 用户态 API：config / upload / files / jobs CRUD / 结果 segments / 产物下载；作用域锁死 `workDir/users/<uid>`（T-07/08）
- `src/routes/transcribeRoutes.ts` **（新）** + `src/routes/routeModules/postTamperModules.ts` 注册 `/api/transcribe`（authenticateToken + transcribeLimiter）
- `src/routes/mediaToolRoutes.ts` — 改用 `serverRuntime` 单例
- `src/middleware/routeLimiters.ts` + `src/routes/routeModules/knownMiddleware.ts` — `transcribeLimiter`（T-08）
- `src/models/mediaToolModels.ts` — `scope`/`ownerId` 字段与索引（T-08）
- `.env.example` — 仅那 10 项 `MEDIA_TOOL_*`（T-09 + C-01/C-02）

### 前端

- `frontend/src/api/transcribe.ts` **（新）** — 用户态 API 客户端（T-07/08）
- `frontend/src/components/speech-to-text/*` **（新）** — 「语音转文本」页面：上传 → 选产物 → 任务轮询 → 分段展示（有时间线 / 无时间线两种视图）→ 下载（T-05/06/07/08）
- `frontend/src/App.tsx` — 路由 `/transcribe` + 标题/描述（懒加载，避免首包超限）
- `frontend/src/navigation/navConfig.ts` — 核心功能组新增「语音转文本」（T-08）
- `frontend/src/components/env-manager/MediaToolConfigSection.tsx` + `SelfContained...` **（新）** + `EnvManager.tsx` 注册 + `adminController.ts` 的 `ENV_READ_WHITELIST` — 那 10 项环境变量的读写面板（T-09 + C-01）
- `frontend/src/api/mediaTool.ts`、`admin/media-tool/TranscribePanel.tsx`、`SettingsPanel.tsx` — 产物三选、新参数（T-02/03/05/09）

### 文档

- `readme.md` 核心功能模块：TTS 段下新增「语音转文本」小节（不重编号，避免巨型 diff）

## 判据与风险

- 不新增依赖（`multer`/`express` 已有）；不改锁文件
- 新文件均 ≤800 行（`check:ts-file-size` 硬门禁）；`postTamperModules.ts` 当前 740 行，新增条目须控制在 800 行内
- 不本地构建/测试；提交签名 `-S`，`git log -1 --format=%G?` 必须为 `G`；push 带 `GIT_TERMINAL_PROMPT=0`
- CI 门禁：`build`（后端 tsc + 前端 tsc/vite）、`type-check-backend`、`type-check-frontend`、`check:openapi-drift`、`smoke:obfuscated`（启动即跑 `assertRouteGovernance`，路由策略写错会直接红）、`check:ts-file-size`、`check:frontend-bundle`、CodeQL
