---
title: "运行时遥测上报 API"
sidebar_position: 11
---

# EcoEnchants 运行时遥测上报 API

本文档定义插件端运行时遥测向后端上报时，后端需要实现的接口、鉴权、幂等、响应语义和数据字段。

当前插件默认 API Base URL：

```text
https://tts.chloemlla.com/api/ecoenchants/v1
```

插件会对误配置的重复前缀做容错，例如 `https://tts.chloemlla.com/https://tts.chloemlla.com/api/ecoenchants/v1` 会被规范化为上面的 Base URL。

## 1. 插件端行为

插件本地先将运行时事件写入统一审计事件结构，再同时进入本地 JSONL 审计日志和远端上报队列。

远端上报不是心跳。只有出现新事件时，插件才会启动定时上报任务；队列清空后，插件会取消该任务并停止请求后端。没有新变更时不会发送空批次。

默认配置：

```yaml
runtime-telemetry:
  remote-reporting:
    enabled: true
    api-url: "https://tts.chloemlla.com/api/ecoenchants/v1"
    endpoint: "/telemetry/events"
    interval-ticks: 1200
    batch-size: 100
    max-queued-events: 5000
    timeout-ms: 3000
    require-activation-token: true
```

上报周期为 `interval-ticks`，默认 1200 tick，约 60 秒。每批最多 `batch-size` 条事件。队列超过 `max-queued-events` 时，插件会丢弃超限事件并在 `/ecoenchants services` 中展示 dropped 计数。

## 2. 接口

### `POST /telemetry/events`

完整 URL：

```text
POST https://tts.chloemlla.com/api/ecoenchants/v1/telemetry/events
```

插件端将任意 `2xx` 响应视为成功。非 `2xx`、连接失败、超时都会将该批事件重新放回队列，等待下一次周期重试。

## 3. 请求头

| Header | 必填 | 说明 |
| --- | --- | --- |
| `Content-Type` | 是 | 固定 `application/json; charset=utf-8` |
| `Accept` | 是 | 固定 `application/json` |
| `User-Agent` | 是 | 例如 `EcoEnchants/13.0.0 Paper/1.21.11 Java/21` |
| `Authorization` | 默认必填 | `Bearer <activationToken>`，来自授权校验响应 |
| `X-Request-Id` | 是 | 插件每次请求生成的 UUID |
| `Idempotency-Key` | 是 | 本次 HTTP 批次 UUID |
| `X-Eco-Product-Id` | 是 | 固定 `ecoenchants` |
| `X-Eco-Installation-Id` | 是 | 插件本地安装实例 UUID |
| `X-Eco-Plugin-Version` | 是 | 插件版本 |

后端授权接口 `POST /licenses/verify` 应在 `valid` 或 `trial` 响应中返回：

```json
{
  "status": "valid",
  "activationToken": "short-lived-token",
  "activationId": "act_01JZ0000000000000000000000"
}
```

如果 `runtime-telemetry.remote-reporting.require-activation-token` 为 `true`，而授权响应没有 `activationToken`，插件只保留本地审计日志，不会远端上报。

## 4. 请求体

```json
{
  "productId": "ecoenchants",
  "installationId": "7f29607c-3e30-4b6b-8476-b0b286d9fb10",
  "activationId": "act_01JZ0000000000000000000000",
  "plugin": {
    "version": "13.0.0",
    "channel": "stable"
  },
  "server": {
    "platform": "Paper",
    "platformVersion": "1.21.11-R0.1-SNAPSHOT",
    "minecraftVersion": "1.21.11",
    "onlineMode": true,
    "javaVersion": "21.0.7"
  },
  "batch": {
    "id": "9a8c4d8f-9f14-4413-b4c7-6b8c8a6fba38",
    "sequence": 42,
    "createdAt": "2026-06-06T08:00:00Z",
    "eventCount": 2
  },
  "events": [
    {
      "eventId": "c880f80b-f7e7-45d6-8d06-50534bb2b0fe",
      "timestamp": "2026-06-06T08:00:00Z",
      "category": "identity_anchor",
      "payload": {}
    }
  ]
}
```

### 幂等要求

后端必须按 `eventId` 去重。同一事件在网络超时、连接中断或后端返回非 `2xx` 后可能被再次发送。`Idempotency-Key` 只代表本次 HTTP 批次，不能替代事件级去重。

建议唯一键：

```text
productId + installationId + eventId
```

## 5. 事件结构

每个事件固定包含：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `eventId` | string | 插件生成的 UUID，事件级幂等键 |
| `timestamp` | string | ISO-8601 UTC |
| `category` | string | 事件类别 |
| `payload` | object | 类别相关字段 |

当前插件可能发送的 `category`：

| Category | 说明 |
| --- | --- |
| `telemetry_lifecycle` | 插件遥测启动、重载、停止 |
| `environment_probe` | JVM 参数、系统属性、环境变量等透明合规探针结果 |
| `identity_anchor` | 玩家 UUID、名称、online-mode、网络路由哈希 |
| `client_context` | 协议版本、客户端品牌、语言、视距、ping |
| `session_end` | 玩家会话结束 |
| `trajectory_sample` | 可配置的移动轨迹采样 |
| `trajectory_anomaly` | 超阈值位移或速度异常 |
| `trajectory_transition` | 传送、跨世界移动等空间上下文切换 |
| `state_transition` | 飞行等玩家状态切换 |
| `state_baseline` | 玩家背包状态基线哈希 |
| `state_delta` | 背包状态哈希变化 |
| `economy_delta` | 经验、等级、附魔消耗等经济流转 |
| `behavioral_text` | 聊天或命令文本风险元数据 |

## 6. 隐私边界

默认情况下，插件不会上传明文玩家 IP、完整背包内容或完整聊天文本。

默认上传的是：

- 玩家 UUID 与名称。
- 网络地址、hostname、virtual host 的 SHA-256 本地盐哈希。
- 坐标采样和世界 UUID，世界名称为哈希。
- 背包整体哈希和按材料汇总的数量。
- 聊天或命令的长度、哈希、风险词命中结果。

只有管理员显式开启以下配置时，才会扩大数据面：

```yaml
runtime-telemetry:
  privacy:
    include-raw-network-addresses: true
  text:
    capture-raw: true
```

后端应将这些字段按敏感数据处理，并支持按 `installationId` 和时间范围删除遥测记录。

## 7. 响应

推荐成功响应：

```json
{
  "requestId": "req_01JZ0000000000000000000000",
  "status": "accepted",
  "acceptedEvents": 100,
  "duplicateEvents": 3,
  "rejectedEvents": [],
  "serverTime": "2026-06-06T08:00:01Z"
}
```

如果单条事件字段不符合后端业务规则，但请求整体已被处理，建议仍返回 `200` 或 `202`，并在 `rejectedEvents` 中说明。插件只按 HTTP 状态判断是否重试；如果后端用 `4xx` 拒绝整批，插件会保留并重试整批。

推荐错误响应：

```json
{
  "requestId": "req_01JZ0000000000000000000000",
  "error": {
    "code": "invalid_activation_token",
    "message": "Activation token is missing, expired, or revoked.",
    "retryAfterSeconds": 300
  }
}
```

## 8. 状态码语义

| 状态码 | 插件行为 | 后端语义 |
| --- | --- | --- |
| `200` / `202` / 其他 `2xx` | 认为成功，移除该批事件 | 批次已接收或已入队 |
| `400` / `422` | 重试整批 | 请求结构不被接受，后端应谨慎使用 |
| `401` / `403` | 重试整批 | token 无效或授权不足 |
| `409` | 重试整批 | 幂等冲突，建议改为 `2xx` 并报告 duplicate |
| `429` | 重试整批 | 限流 |
| `500` / `503` | 重试整批 | 后端暂不可用 |

## 9. 后端验收清单

- 实现 `POST /api/ecoenchants/v1/licenses/verify`，并在成功响应中返回 `activationToken` 和 `activationId`。
- 实现 `POST /api/ecoenchants/v1/telemetry/events`。
- 验证 `Authorization: Bearer <activationToken>`。
- 按 `productId + installationId + eventId` 做事件级幂等去重。
- 接收重复事件时返回 `2xx`，不要让插件无限重试已入库数据。
- 对 `events` 设置合理上限，至少支持默认批量 100 条。
- 所有时间按 ISO-8601 UTC 存储。
- 对明文网络地址和 raw text 字段设置更高权限和更短保留周期。
- 对 `401`、`403`、`429`、`5xx` 做监控；这些状态会导致插件保留队列并周期重试。
