import type { Request, Response } from "express";
import { isAdminRole, isSuperAdmin } from "../../middleware/auth";
import { getClientIP } from "../../utils/ipUtils";

export function getClientIp(req: Request): string {
  return getClientIP(req);
}

export function requireAdmin(req: Request, res: Response): boolean {
  const isAdmin = isAdminRole((req as any).user?.role);

  if (!isAdmin) {
    res.status(403).json({ success: false, error: "权限不足" });
    return false;
  }
  return true;
}

export function requireSuperAdmin(req: Request, res: Response): boolean {
  if (!isSuperAdmin(req)) {
    res.status(403).json({ success: false, error: "权限不足" });
    return false;
  }
  return true;
}

const IPV4_REGEX = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
const IPV4_CIDR_REGEX =
  /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\/([0-9]|[12][0-9]|3[0-2])$/;
const IPV6_REGEX =
  /^(?:(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}|(?:[0-9a-fA-F]{1,4}:){1,7}:|(?:[0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|::|(?:[0-9a-fA-F]{1,4}:){1,5}(?::[0-9a-fA-F]{1,4}){1,2}|(?:[0-9a-fA-F]{1,4}:){1,4}(?::[0-9a-fA-F]{1,4}){1,3}|(?:[0-9a-fA-F]{1,4}:){1,3}(?::[0-9a-fA-F]{1,4}){1,4}|(?:[0-9a-fA-F]{1,4}:){1,2}(?::[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:(?::[0-9a-fA-F]{1,4}){1,6}|:(?:(?::[0-9a-fA-F]{1,4}){1,7}|:))$/;
const IPV6_CIDR_REGEX =
  /^(?:(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}|(?:[0-9a-fA-F]{1,4}:){1,7}:|(?:[0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|::|(?:[0-9a-fA-F]{1,4}:){1,5}(?::[0-9a-fA-F]{1,4}){1,2}|(?:[0-9a-fA-F]{1,4}:){1,4}(?::[0-9a-fA-F]{1,4}){1,3}|(?:[0-9a-fA-F]{1,4}:){1,3}(?::[0-9a-fA-F]{1,4}){1,4}|(?:[0-9a-fA-F]{1,4}:){1,2}(?::[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:(?::[0-9a-fA-F]{1,4}){1,6}|:(?:(?::[0-9a-fA-F]{1,4}){1,7}|:))\/([0-9]|[1-9][0-9]|1[01][0-9]|12[0-8])$/;

export function isValidIpOrCidr(ip: string): boolean {
  return IPV4_REGEX.test(ip) || IPV4_CIDR_REGEX.test(ip) || IPV6_REGEX.test(ip) || IPV6_CIDR_REGEX.test(ip);
}

export function validateBanDuration(durationMinutes: unknown): { value: number } | { error: string } {
  let banDuration = 60;
  if (durationMinutes !== undefined && durationMinutes !== null) {
    const duration = Number(durationMinutes);
    if (Number.isNaN(duration) || !Number.isFinite(duration)) {
      return { error: "封禁时长必须是有效的数字" };
    }
    banDuration = Math.min(Math.max(duration, 1), 24 * 60);
  }
  return { value: banDuration };
}
