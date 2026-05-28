import type { Request, Response } from "express";
import { TurnstileService } from "../../services/turnstileService";
import { isValidIpOrCidr, requireAdmin, validateBanDuration } from "./_helpers";

export async function banIp(req: Request, res: Response) {
  try {
    if (!requireAdmin(req, res)) return;

    const { ipAddress, reason, durationMinutes, fingerprint, userAgent } = req.body;

    if (!ipAddress || typeof ipAddress !== "string") {
      return res.status(400).json({ success: false, error: "IP地址参数无效" });
    }

    if (!reason || typeof reason !== "string") {
      return res.status(400).json({ success: false, error: "封禁原因参数无效" });
    }

    if (!isValidIpOrCidr(ipAddress)) {
      return res.status(400).json({
        success: false,
        error: "IP地址格式无效，支持单个IP或CIDR格式（例如：192.168.1.1 或 192.168.1.0/24）",
      });
    }

    const durationResult = validateBanDuration(durationMinutes);
    if ("error" in durationResult) {
      return res.status(400).json({ success: false, error: durationResult.error });
    }
    const banDuration = durationResult.value;

    const banResult = await TurnstileService.manualBanIp(ipAddress, reason, banDuration, fingerprint, userAgent);

    if (banResult.success) {
      res.json({
        success: true,
        message: `IP ${ipAddress} 封禁操作成功，过期时间: ${banResult.expiresAt}`,
        banInfo: {
          ipAddress,
          reason,
          durationMinutes: banDuration,
          expiresAt: banResult.expiresAt,
          bannedAt: banResult.bannedAt,
        },
      });
    } else {
      res.status(500).json({ success: false, error: banResult.error || "封禁失败" });
    }
  } catch (error) {
    console.error("手动封禁IP失败:", error);
    res.status(500).json({ success: false, error: "服务器内部错误" });
  }
}

export async function unbanIp(req: Request, res: Response) {
  try {
    if (!requireAdmin(req, res)) return;

    const { ipAddress } = req.body;

    if (!ipAddress || typeof ipAddress !== "string") {
      return res.status(400).json({ success: false, error: "IP地址参数无效" });
    }

    if (!isValidIpOrCidr(ipAddress)) {
      return res.status(400).json({
        success: false,
        error: "IP地址格式无效，支持单个IP或CIDR格式（例如：192.168.1.1 或 192.168.1.0/24）",
      });
    }

    const success = await TurnstileService.unbanIp(ipAddress);

    if (success) {
      res.json({ success: true, message: `IP ${ipAddress} 封禁已解除` });
    } else {
      res.status(404).json({ success: false, error: "IP地址未找到或未被封禁" });
    }
  } catch (error) {
    console.error("解除IP封禁失败:", error);
    res.status(500).json({ success: false, error: "服务器内部错误" });
  }
}

export async function batchBanIps(req: Request, res: Response) {
  try {
    if (!requireAdmin(req, res)) return;

    const { ipAddresses, reason, durationMinutes } = req.body;

    if (!Array.isArray(ipAddresses) || ipAddresses.length === 0) {
      return res.status(400).json({ success: false, error: "IP地址列表参数无效" });
    }

    if (!reason || typeof reason !== "string") {
      return res.status(400).json({ success: false, error: "封禁原因参数无效" });
    }

    const invalidIPs = ipAddresses.filter((ip) => !isValidIpOrCidr(ip));

    if (invalidIPs.length > 0) {
      return res.status(400).json({
        success: false,
        error: "以下IP地址格式无效，支持单个IP或CIDR格式（例如：192.168.1.1 或 192.168.1.0/24）",
        invalidIPs,
      });
    }

    const durationResult = validateBanDuration(durationMinutes);
    if ("error" in durationResult) {
      return res.status(400).json({ success: false, error: durationResult.error });
    }
    const banDuration = durationResult.value;

    const results = [];
    const errors = [];

    for (const ipAddress of ipAddresses) {
      try {
        const banResult = await TurnstileService.manualBanIp(ipAddress, reason, banDuration);

        if (banResult.success) {
          results.push({
            ipAddress,
            success: true,
            message: `IP ${ipAddress} 封禁操作成功，过期时间: ${banResult.expiresAt}`,
            banInfo: {
              reason,
              durationMinutes: banDuration,
              expiresAt: banResult.expiresAt,
              bannedAt: banResult.bannedAt,
            },
          });
        } else {
          errors.push({ ipAddress, error: banResult.error || "封禁失败" });
        }
      } catch (error) {
        errors.push({ ipAddress, error: error instanceof Error ? error.message : "未知错误" });
      }
    }

    res.json({
      success: true,
      total: ipAddresses.length,
      successful: results.length,
      failed: errors.length,
      results,
      errors,
    });
  } catch (error) {
    console.error("批量封禁IP失败:", error);
    res.status(500).json({ success: false, error: "服务器内部错误" });
  }
}

export async function batchUnbanIps(req: Request, res: Response) {
  try {
    if (!requireAdmin(req, res)) return;

    const { ipAddresses } = req.body;

    if (!Array.isArray(ipAddresses) || ipAddresses.length === 0) {
      return res.status(400).json({ success: false, error: "IP地址列表参数无效" });
    }

    const invalidIPs = ipAddresses.filter((ip) => !isValidIpOrCidr(ip));

    if (invalidIPs.length > 0) {
      return res.status(400).json({
        success: false,
        error: "以下IP地址格式无效，支持单个IP或CIDR格式（例如：192.168.1.1 或 192.168.1.0/24）",
        invalidIPs,
      });
    }

    const results = [];
    const errors = [];

    for (const ipAddress of ipAddresses) {
      try {
        const success = await TurnstileService.unbanIp(ipAddress);

        if (success) {
          results.push({ ipAddress, success: true, message: `IP ${ipAddress} 封禁已解除` });
        } else {
          errors.push({ ipAddress, error: "IP地址未找到或未被封禁" });
        }
      } catch (error) {
        errors.push({ ipAddress, error: error instanceof Error ? error.message : "未知错误" });
      }
    }

    res.json({
      success: true,
      total: ipAddresses.length,
      successful: results.length,
      failed: errors.length,
      results,
      errors,
    });
  } catch (error) {
    console.error("批量解封IP失败:", error);
    res.status(500).json({ success: false, error: "服务器内部错误" });
  }
}
