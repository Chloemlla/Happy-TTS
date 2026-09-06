# 缺陷汇总：IPLocation provider 全灭 + RuntimeConfig 弱码刷屏（2026-09-06）

取证来源：生产 tts-node 容器日志（raksmart，2026-09-06 12:59:30 / 13:02:25）+ 容器内 node fetch 实测（2026-09-06）。

## H2 IP 归属地 provider 从生产机全部不可用 → 每次查询刷 warn

- 位置：`src/services/ipTelemetryService.ts`（`IP_LOCATION_PROVIDERS` + `lookupIpLocation`）与 `src/services/ip.ts`（`API_PROVIDERS`）
- 类型：外部依赖失效（两个 provider 在部署机均只返回 HTML），叠加代码对非 JSON 响应无防护
- 详细错误信息：
  - 症状：日志每出现一次归属地查询就刷 `[IPLocation] Provider lookup failed { provider: 'api.vore.top', ..., error: 'Unexpected token '<', "<br />\n<b>"... is not valid JSON' }`
  - 根因取证（容器内 `node fetch` 实测）：
    - `api.vore.top` → 200 但 `content-type: text/html`，正文是对方后端 PHP `Fatal error: RedisException: MISCONF Redis is configured to save RDB snapshots ... unable to persist to disk`——**对方 Redis 写盘失败，服务实质已瘫**
    - `ipapi.co` → 403 `text/html`，Cloudflare `Just a moment...` 人机挑战——**对机房 IP 直接拦**
    - `response.json()` 对 HTML 抛 `Unexpected token '<'`，每次 lookup 每个 provider 各刷一条 warn
  - 涉及两份 provider 表：telemetry（无冷却，每次查询都打）与 ip.ts（有 5 分钟冷却，每 5 分钟 fail 一次但功能同样瘫）
- 修复：
  - **替换 provider**（生产实测均返回 JSON、HTTPS、免 token）：
    - telemetry：`ipwho.is` / `freeipapi.com` / `ipapi.is`
    - ip.ts：`ipwho.is` / `freeipapi.com`（保留 tool.lu 优先 + 既有冷却机制不动）
  - **JSON content-type guard**（`lookupIpLocation`）：非 JSON 响应不抛 `Unexpected token`，直接判 provider 失败进入冷却
  - **provider 失败冷却**（5 分钟，镜像 ip.ts `PROVIDER_COOLDOWN_MS`）：坏 provider 冷却期内跳过，不再每次查询都重试并刷告警
  - **全失败告警节流**：每 5 分钟最多一条 `All IP location providers failed`，防高频请求刷屏
- 复现条件：任意归属地查询（如访客 IP `13.214.56.168`）
- 影响面：`lookupIpLocation`（telemetry 归属地）与 `tryAllProviders`（IP 风控 geo 信息）；两者从生产机此前均 100% 失败
- 测试影响：无直接测试；`ip.ts` / `ipTelemetryService.ts` 无 provider 级单测

## H3 RuntimeConfig 弱 TTS 生成码每 10s 周期刷新刷 warn

- 位置：`src/services/runtimeConfigService.ts`（`normalizeStoredTtsConfig`）
- 类型：配置语义缺陷——存储里的弱码被拒后直接关闭共享码闸门，且每 10s 周期刷新重复告警
- 详细错误信息：
  - 症状：每 10s 一条 `[RuntimeConfig] Ignoring weak TTS generation code from storage/defaults`
  - 根因：Mongo `runtime_config_settings` 的 TTS 文档存有历史遗留弱码（实测值非空但远低于 24 字符强度门槛）；`normalizeStoredTtsConfig` 对弱存储码走 `assertStrongGenerationCode` catch → warn → `generationCode = ""`。而 `ensurePeriodicRefresh` 每 10s 重新 `initialize(true)` 全量 normalize，弱码数据不修就无限刷屏
  - 同时：env `GENERATION_CODE` 配置了强码（启动时经 `normalizeGenerationCode`，config.ts:318），却被存储里的弱遗留值盖过——共享码闸门在运维已配置强码的情况下被静默关闭
  - 存储弱码不可能来自正常写入路径：`setTtsSetting` 写入时已强制强度校验，弱码只能来自早期无强校验的种子/手工数据
- 修复（代码 + 数据双层）：
  - 数据：生产 Mongo TTS 文档遗留弱码 `"1145"`（2026-06-27 写入）已由数据层清空（用户确认）→ stored 空 → 回退运行时默认（env 强码），共享码闸门恢复开启
  - 代码：`normalizeStoredTtsConfig` **保持严格校验**——弱存储码一律拒绝并关闭闸门，不回退 env（Mongo 是权威，且 env `GENERATION_CODE` 仅经 `normalizeGenerationCode` trim+截断、不保证强度）；仅新增**告警节流**（同一弱码每 5 分钟最多告警一条），消除 10s 周期刷新刷屏
  - 不依赖 env 强度：即使未来 env 与存储均为弱码，仍 fail-closed + 节流告警，安全语义与既有设计一致
- 复现条件：Mongo TTS 文档含弱 `generationCode` + 服务持续运行
- 影响面：`getTtsSetting` / `initialize` / `setTtsSetting` 共享此 normalize 路径；改动只影响"存储弱码"分支
- 测试影响：`runtimeConfigTtsProviderFallback.test.ts`（TTS_PROVIDER 回退，mock Mongo）与 `configurationNoticeIssues.test.ts`（mock runtimeMutableConfig）均不触发本路径，未破坏
