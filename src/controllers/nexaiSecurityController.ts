import type { Request, Response } from "express";
import logger from "../utils/logger";
import {
  detectAnomalies,
  extractSecurityHeaders,
  getDeviceStatus,
  getRiskStrategy,
  incrementBlockedCount,
  recordSecurityEvent,
  trackDevice,
} from "../services/nexaiSecurityService";

/**
 * POST /nexai/security/report
 * Client reports security event
 */
export async function reportSecurityEvent(req: Request, res: Response): Promise<void> {
  try {
    const headers = extractSecurityHeaders(req);
    const { event_type, details, timestamp } = req.body;

    if (!headers.deviceFingerprint) {
      res.status(400).json({
        error: "Missing device fingerprint",
      });
      return;
    }

    if (!event_type) {
      res.status(400).json({
        error: "Missing event_type",
      });
      return;
    }

    const userId = (req as any).user?.id;
    const ipAddress = (req.ip || req.headers["x-forwarded-for"] || req.socket.remoteAddress) as string;
    const userAgent = req.headers["user-agent"] || "";

    // Record the security event
    await recordSecurityEvent(
      headers.deviceFingerprint,
      userId,
      event_type,
      details || {},
      headers.riskScore,
      ipAddress,
      userAgent
    );

    // Track device if user is authenticated
    if (userId) {
      await trackDevice(userId, headers, ipAddress, userAgent);
    }

    // Determine action based on risk strategy
    const strategy = getRiskStrategy(headers);
    let action = "monitor";

    if (strategy === "BLOCK") {
      action = "block";
      if (userId && headers.deviceFingerprint) {
        await incrementBlockedCount(userId, headers.deviceFingerprint);
      }
    } else if (strategy === "HONEYPOT") {
      action = "honeypot";
    } else if (strategy === "RESTRICT") {
      action = "restrict";
    }

    logger.info(
      `Security event reported: ${event_type} from device ${headers.deviceFingerprint}, action: ${action}`
    );

    res.json({
      status: "recorded",
      action,
      message:
        action === "block"
          ? "Device has been flagged for security review"
          : "Event recorded successfully",
    });
  } catch (error) {
    logger.error("Error reporting security event:", error);
    res.status(500).json({
      error: "Internal server error",
    });
  }
}

/**
 * GET /nexai/security/status
 * Query device security status
 */
export async function getSecurityStatus(req: Request, res: Response): Promise<void> {
  try {
    const headers = extractSecurityHeaders(req);

    if (!headers.deviceFingerprint) {
      res.status(400).json({
        error: "Missing device fingerprint",
      });
      return;
    }

    const status = await getDeviceStatus(headers.deviceFingerprint);

    if (!status) {
      res.json({
        device_fingerprint: headers.deviceFingerprint,
        status: "unknown",
        risk_level: "SAFE",
        restrictions: [],
        message: "Device not found in database",
      });
      return;
    }

    res.json({
      device_fingerprint: headers.deviceFingerprint,
      status: status.status,
      risk_level: status.riskLevel,
      restrictions: status.restrictions,
      message: status.message,
    });
  } catch (error) {
    logger.error("Error getting security status:", error);
    res.status(500).json({
      error: "Internal server error",
    });
  }
}

/**
 * GET /nexai/security/anomalies
 * Check for anomalies (requires authentication)
 */
export async function checkAnomalies(req: Request, res: Response): Promise<void> {
  try {
    const headers = extractSecurityHeaders(req);
    const userId = (req as any).user?.id;

    if (!userId) {
      res.status(401).json({
        error: "Authentication required",
      });
      return;
    }

    if (!headers.deviceFingerprint) {
      res.status(400).json({
        error: "Missing device fingerprint",
      });
      return;
    }

    const anomalies = await detectAnomalies(headers.deviceFingerprint, userId);

    res.json({
      device_fingerprint: headers.deviceFingerprint,
      user_id: userId,
      anomalies: {
        multi_account: anomalies.multiAccount,
        frequent_device_switch: anomalies.frequentDeviceSwitch,
      },
      details: {
        account_count: anomalies.accountCount,
        device_count: anomalies.deviceCount,
      },
    });
  } catch (error) {
    logger.error("Error checking anomalies:", error);
    res.status(500).json({
      error: "Internal server error",
    });
  }
}

/**
 * POST /nexai/security/track
 * Manually track device (requires authentication)
 */
export async function trackDeviceManually(req: Request, res: Response): Promise<void> {
  try {
    const headers = extractSecurityHeaders(req);
    const userId = (req as any).user?.id;

    if (!userId) {
      res.status(401).json({
        error: "Authentication required",
      });
      return;
    }

    if (!headers.deviceFingerprint) {
      res.status(400).json({
        error: "Missing device fingerprint",
      });
      return;
    }

    const ipAddress = (req.ip || req.headers["x-forwarded-for"] || req.socket.remoteAddress) as string;
    const userAgent = req.headers["user-agent"] || "";

    await trackDevice(userId, headers, ipAddress, userAgent);

    res.json({
      status: "tracked",
      device_fingerprint: headers.deviceFingerprint,
      risk_level: headers.riskLevel,
      risk_score: headers.riskScore,
    });
  } catch (error) {
    logger.error("Error tracking device:", error);
    res.status(500).json({
      error: "Internal server error",
    });
  }
}

/**
 * GET /nexai/security/stats
 * Get dashboard statistics (requires admin authentication)
 */
export async function getDashboardStats(req: Request, res: Response): Promise<void> {
  try {
    const { DeviceTracking } = await import("../models/deviceTrackingModel");
    const { SecurityEvent } = await import("../models/securityEventModel");

    const timeRange = (req.query.timeRange as string) || "24h";
    const timeRangeMs: Record<string, number> = {
      "1h": 60 * 60 * 1000,
      "24h": 24 * 60 * 60 * 1000,
      "7d": 7 * 24 * 60 * 60 * 1000,
      "30d": 30 * 24 * 60 * 60 * 1000,
    };

    const startTime = new Date(Date.now() - (timeRangeMs[timeRange] || timeRangeMs["24h"]));

    const totalDevices = await DeviceTracking.countDocuments({});
    const highRiskDevices = await DeviceTracking.countDocuments({ riskScore: { $gte: 50 } });
    const compromisedDevices = await DeviceTracking.countDocuments({ isCompromised: true });
    const totalEvents = await SecurityEvent.countDocuments({ createdAt: { $gte: startTime } });

    const riskDistribution = {
      SAFE: await DeviceTracking.countDocuments({ riskLevel: "SAFE" }),
      LOW: await DeviceTracking.countDocuments({ riskLevel: "LOW" }),
      MEDIUM: await DeviceTracking.countDocuments({ riskLevel: "MEDIUM" }),
      HIGH: await DeviceTracking.countDocuments({ riskLevel: "HIGH" }),
      CRITICAL: await DeviceTracking.countDocuments({ riskLevel: "CRITICAL" }),
    };

    const eventTypeAggregation = await SecurityEvent.aggregate([
      { $match: { createdAt: { $gte: startTime } } },
      { $group: { _id: "$eventType", count: { $sum: 1 } } },
    ]);

    const eventTypeDistribution: Record<string, number> = {};
    for (const item of eventTypeAggregation) {
      eventTypeDistribution[item._id] = item.count;
    }

    const recentEvents = await SecurityEvent.find({ createdAt: { $gte: startTime } })
      .sort({ createdAt: -1 })
      .limit(20)
      .lean();

    const topRiskyDevices = await DeviceTracking.find({})
      .sort({ riskScore: -1 })
      .limit(10)
      .lean();

    res.json({
      totalDevices,
      highRiskDevices,
      compromisedDevices,
      totalEvents,
      riskDistribution,
      eventTypeDistribution,
      recentEvents,
      topRiskyDevices,
    });
  } catch (error) {
    logger.error("Error getting dashboard stats:", error);
    res.status(500).json({ error: "Internal server error" });
  }
}

/**
 * GET /nexai/security/devices
 * Get device list with pagination (requires admin authentication)
 */
export async function getDeviceList(req: Request, res: Response): Promise<void> {
  try {
    const { DeviceTracking } = await import("../models/deviceTrackingModel");

    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const riskLevel = req.query.riskLevel as string;
    const search = req.query.search as string;

    const query: any = {};
    if (riskLevel && riskLevel !== "all") query.riskLevel = riskLevel;
    if (search) {
      query.$or = [
        { deviceFingerprint: { $regex: search, $options: "i" } },
        { userId: { $regex: search, $options: "i" } },
      ];
    }

    const total = await DeviceTracking.countDocuments(query);
    const devices = await DeviceTracking.find(query)
      .sort({ lastSeen: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean();

    res.json({
      devices,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (error) {
    logger.error("Error getting device list:", error);
    res.status(500).json({ error: "Internal server error" });
  }
}

/**
 * GET /nexai/security/events
 * Get security events with pagination (requires admin authentication)
 */
export async function getSecurityEvents(req: Request, res: Response): Promise<void> {
  try {
    const { SecurityEvent } = await import("../models/securityEventModel");

    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const eventType = req.query.eventType as string;
    const deviceFingerprint = req.query.deviceFingerprint as string;

    const query: any = {};
    if (eventType && eventType !== "all") query.eventType = eventType;
    if (deviceFingerprint) query.deviceFingerprint = deviceFingerprint;

    const total = await SecurityEvent.countDocuments(query);
    const events = await SecurityEvent.find(query)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean();

    res.json({
      events,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (error) {
    logger.error("Error getting security events:", error);
    res.status(500).json({ error: "Internal server error" });
  }
}
