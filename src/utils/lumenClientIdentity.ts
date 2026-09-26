/**
 * Project-Lumen 官方客户端身份解析（S-02）。
 *
 * 与 Synapse 主账号的 `getAuthSessionMetadata()` 保持同一套词汇与候选键，但单独实现，
 * 因为 lumen 子系统不接触 auth_sessions：它的会话落在 `sessions` 集合，只需要
 * clientType / platform / deviceName / userAgent / ipAddress 这几个展示字段。
 *
 * 候选顺序刻意与主账号一致（x-client-name → x-synapse-client-name → x-client →
 * body.clientType/clientName），并接受 lumen 客户端实际发送的 `X-Device-Id` / `X-Device-Name`。
 *
 * 默认值：`/api/lumen/**` 目前只有 Project-Lumen 一个官方客户端，请求没带身份头时按
 * Project-Lumen / Android 归类，而不是丢进 other —— 否则「设备与会话」里会出现
 * 一组既没有客户端名也没有机型的僵尸设备。
 */
import crypto from "node:crypto";
import type { Request } from "express";
import { getClientIP } from "./ipUtils";
import type { LumenClientInfo } from "../services/lumen/auth.service";

export interface LumenRequestIdentity extends LumenClientInfo {
  deviceInstallationId?: string;
}

const DEFAULT_CLIENT_TYPE = "Project-Lumen";
const DEFAULT_PLATFORM = "Android";

function clampText(value: unknown, max: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, max) : undefined;
}

function firstText(candidates: unknown[], max: number): string | undefined {
  for (const candidate of candidates) {
    const text = clampText(candidate, max);
    if (text) return text;
  }
  return undefined;
}

/** 与 authSessionService.normalizeClientType 同集合的展示名归一化。 */
function normalizeClientType(value: unknown): string | undefined {
  const normalized = clampText(value, 64)?.toLowerCase();
  if (!normalized) return undefined;
  if (normalized === "piliplus" || normalized.includes("pili")) return "PiliPlus";
  if (normalized === "synapse-client" || normalized.includes("synapse")) return "Synapse-Client";
  if (
    normalized === "project-lumen" ||
    normalized === "projectlumen" ||
    normalized === "project_lumen" ||
    normalized.includes("project-lumen") ||
    normalized === "lumen"
  ) {
    return "Project-Lumen";
  }
  if (normalized === "web" || normalized.includes("browser")) return "web";
  return "other";
}

/** 平台标签只做首字母大写，保留 Synapse-Client 的 `Android` 写法。 */
function normalizePlatform(value: unknown): string | undefined {
  const raw = clampText(value, 64);
  if (!raw) return undefined;
  if (raw.length <= 1) return raw.toUpperCase();
  return raw[0].toUpperCase() + raw.slice(1);
}

function headerText(req: Request, name: string): string | undefined {
  const value = req.headers?.[name];
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value[0];
  return undefined;
}

export function resolveLumenClientInfo(req: Request): LumenRequestIdentity {
  const body = req.body && typeof req.body === "object" ? (req.body as Record<string, unknown>) : {};

  const rawClientType = firstText(
    [
      headerText(req, "x-client-name"),
      headerText(req, "x-synapse-client-name"),
      headerText(req, "x-client"),
      headerText(req, "x-synapse-client-id"),
      body.clientType,
      body.client_type,
      body.clientName,
      body.client_name,
      body.client,
    ],
    64,
  );

  const platform = normalizePlatform(
    firstText(
      [headerText(req, "x-platform"), headerText(req, "x-synapse-platform"), body.platform],
      64,
    ),
  );

  const deviceInstallationId = firstText(
    [headerText(req, "x-device-id"), headerText(req, "x-synapse-device-id"), body.deviceId, body.device_id],
    160,
  );

  const deviceName = firstText(
    [headerText(req, "x-device-name"), headerText(req, "x-synapse-device-name"), body.deviceName, body.device_name],
    128,
  );

  return {
    clientType: normalizeClientType(rawClientType) ?? DEFAULT_CLIENT_TYPE,
    platform: platform ?? DEFAULT_PLATFORM,
    ...(deviceName ? { deviceName } : {}),
    userAgent: clampText(headerText(req, "user-agent"), 512),
    ipAddress: clampText(getClientIP(req), 128),
    ...(deviceInstallationId ? { deviceInstallationId } : {}),
  };
}

/** 设备分组键：与 auth_sessions.deviceKey 同形状（40 位十六进制），便于前端复用展示逻辑。 */
export function deriveLumenDeviceKey(
  userId: string,
  clientType: string | undefined,
  deviceInstallationId: string | undefined,
  userAgent: string | undefined,
): string {
  const seed = (deviceInstallationId || "").trim() || (userAgent || "").trim() || "unknown";
  const raw = `${userId}|${clientType || "other"}|${seed}`;
  return crypto.createHash("sha256").update(raw).digest("hex").slice(0, 40);
}
