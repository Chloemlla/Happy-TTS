import crypto from "node:crypto";
import logger from "../utils/logger";
import { getIPInfo } from "./ip";

/**
 * Risk Evaluation Engine for SmartHumanCheck
 * Implements IP-based risk scoring, device fingerprint consistency checks,
 * and threat detection algorithms for suspicious patterns.
 */

export interface RiskFactors {
  ipRisk: number;
  deviceConsistency: number;
  behavioralAnomalies: number;
  temporalPatterns: number;
  geographicRisk: number;
}

export interface RiskAssessmentResult {
  overallRisk: number; // 0-1 scale, higher = more risky
  riskLevel: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  factors: RiskFactors;
  flags: string[];
  recommendations: string[];
  blocked: boolean;
  reason?: string;
}

export interface DeviceFingerprint {
  canvasEntropy: string;
  userAgent: string;
  timezone: string;
  screenResolution?: string;
  language?: string;
  platform?: string;
}

export interface VerificationAttempt {
  ip: string;
  timestamp: number;
  userAgent: string;
  deviceFingerprint: DeviceFingerprint;
  behaviorScore: number;
  success: boolean;
  nonce?: string;
}

// Risk thresholds
const RISK_THRESHOLDS = {
  LOW: 0.3,
  MEDIUM: 0.6,
  HIGH: 0.8,
  CRITICAL: 0.95,
};

// IP reputation cache
const ipReputationCache = new Map<string, { reputation: number; timestamp: number }>();
const IP_REPUTATION_TTL = 3600000; // 1 hour
const MAX_IP_CACHE_SIZE = 5000; // G7-29: bounded cache

// Device fingerprint tracking
const deviceFingerprintHistory = new Map<string, VerificationAttempt[]>();
const FINGERPRINT_HISTORY_TTL = 86400000; // 24 hours
const MAX_FINGERPRINT_HISTORY = 100;

// G7-29: IP -> attempts index so getRecentAttempts does not scan every
// fingerprint key on every assessment (it used to make the hot path O(total
// history) per call).
const ipAttemptIndex = new Map<string, VerificationAttempt[]>();
const MAX_IP_INDEX_HISTORY = 200;
const MAX_IP_INDEX_KEYS = 20000;

// Suspicious pattern detection
const _suspiciousPatterns = new Map<string, { count: number; firstSeen: number; lastSeen: number }>();
const _PATTERN_DETECTION_WINDOW = 3600000; // 1 hour

export class RiskEvaluationEngine {
  private readonly blockedIPs = new Set<string>();
  private readonly trustedIPs = new Set<string>();
  private readonly suspiciousUAs = new Set<string>();

  constructor() {
    this.initializeBlockedIPs();
    this.initializeTrustedIPs();
    this.initializeSuspiciousUAs();
  }

  /**
   * Initialize blocked IPs list
   */
  private initializeBlockedIPs(): void {
    // G7-29: an example/placeholder IP (192.168.1.100) was previously baked into
    // production code as a "known malicious IP". Blocked IPs should come from
    // real threat intel, not a sample value. Kept empty by default.
    const envBlocked = process.env.RISK_ENGINE_BLOCKED_IPS;
    if (envBlocked) {
      for (const ip of envBlocked.split(",")) {
        const trimmed = ip.trim();
        if (trimmed) this.blockedIPs.add(trimmed);
      }
    }
  }

  /**
   * Initialize trusted IPs list
   */
  private initializeTrustedIPs(): void {
    // G7-29: localhost was previously trusted unconditionally, which makes every
    // request whose req.ip resolves to loopback "trusted" behind a reverse proxy.
    // Trusted IPs are now an explicit opt-in env list only.
    const envTrusted = process.env.RISK_ENGINE_TRUSTED_IPS;
    if (envTrusted) {
      for (const ip of envTrusted.split(",")) {
        const trimmed = ip.trim();
        if (trimmed) this.trustedIPs.add(trimmed);
      }
    }
  }

  /**
   * Initialize suspicious user agents list
   */
  private initializeSuspiciousUAs(): void {
    // Add known suspicious user agents
    this.suspiciousUAs.add("bot");
    this.suspiciousUAs.add("crawler");
    this.suspiciousUAs.add("spider");
    // Add more suspicious UAs as needed
  }

  /**
   * Main risk assessment method
   */
  async assessRisk(
    ip: string,
    deviceFingerprint: DeviceFingerprint,
    behaviorScore: number,
    userAgent?: string,
  ): Promise<RiskAssessmentResult> {
    const attempt: VerificationAttempt = {
      ip,
      timestamp: Date.now(),
      userAgent: userAgent || deviceFingerprint.userAgent,
      deviceFingerprint,
      behaviorScore,
      success: false, // Will be updated after verification
    };

    // Calculate individual risk factors
    const ipRisk = await this.calculateIPRisk(ip);
    const deviceConsistency = this.calculateDeviceConsistency(deviceFingerprint, ip);
    const behavioralAnomalies = this.calculateBehavioralAnomalies(behaviorScore, attempt);
    const temporalPatterns = this.calculateTemporalPatterns(ip, attempt);
    const geographicRisk = await this.calculateGeographicRisk(ip);

    const factors: RiskFactors = {
      ipRisk,
      deviceConsistency,
      behavioralAnomalies,
      temporalPatterns,
      geographicRisk,
    };

    // Calculate overall risk score (weighted average)
    const overallRisk = this.calculateOverallRisk(factors);

    // Determine risk level
    const riskLevel = this.determineRiskLevel(overallRisk);

    // Generate flags and recommendations
    const flags = this.generateRiskFlags(factors, attempt);
    const recommendations = this.generateRecommendations(factors, riskLevel);

    // Determine if request should be blocked
    const blocked = this.shouldBlock(overallRisk, flags, ip);
    const reason = blocked ? this.getBlockReason(factors, flags) : undefined;

    // Store attempt for pattern analysis
    this.recordAttempt(attempt);

    const result: RiskAssessmentResult = {
      overallRisk,
      riskLevel,
      factors,
      flags,
      recommendations,
      blocked,
      reason,
    };

    logger.info("[风险评估] 评估完成", {
      ip: `${ip.slice(0, 8)}...`,
      riskLevel,
      overallRisk: Math.round(overallRisk * 100) / 100,
      blocked,
      flagCount: flags.length,
    });

    return result;
  }

  /**
   * Calculate IP-based risk score
   */
  private async calculateIPRisk(ip: string): Promise<number> {
    let risk = 0;

    // Check if IP is in blocked list
    if (this.blockedIPs.has(ip)) {
      return 1.0; // Maximum risk
    }

    // Check if IP is trusted
    if (this.trustedIPs.has(ip)) {
      return 0.1; // Minimum risk
    }

    // Check IP reputation cache
    const cached = ipReputationCache.get(ip);
    if (cached && Date.now() - cached.timestamp < IP_REPUTATION_TTL) {
      return cached.reputation;
    }

    try {
      // Get IP geolocation info
      const ipInfo = await getIPInfo(ip);

      // Risk factors based on IP characteristics
      if (ipInfo.country === "未知" || ipInfo.country === "非法IP") {
        risk += 0.4;
      }

      // Check for high-risk countries (simplified example)
      const highRiskCountries = ["Unknown", "Anonymous", "Tor"];
      if (highRiskCountries.includes(ipInfo.country)) {
        risk += 0.3;
      }

      // Check for suspicious ISPs
      const suspiciousISPs = ["VPN", "Proxy", "Hosting", "Cloud"];
      if (suspiciousISPs.some((isp) => ipInfo.isp.toLowerCase().includes(isp.toLowerCase()))) {
        risk += 0.2;
      }

      // Check request frequency from this IP
      const recentAttempts = this.getRecentAttempts(ip, 300000); // 5 minutes
      if (recentAttempts.length > 10) {
        risk += 0.3;
      } else if (recentAttempts.length > 5) {
        risk += 0.15;
      }

      // Cache the result (G7-29: bounded cache — evict oldest when full).
      if (ipReputationCache.size >= MAX_IP_CACHE_SIZE) {
        const oldestKey = ipReputationCache.keys().next().value;
        if (oldestKey !== undefined) ipReputationCache.delete(oldestKey);
      }
      ipReputationCache.set(ip, { reputation: risk, timestamp: Date.now() });

      return Math.min(risk, 1.0);
    } catch (error) {
      logger.error("[风险评估] 计算 IP 风险失败", { ip, error });
      return 0.5; // Default risk for errors
    }
  }

  /**
   * Calculate device fingerprint consistency
   */
  private calculateDeviceConsistency(deviceFingerprint: DeviceFingerprint, _ip: string): number {
    let consistency = 1.0; // Start with perfect consistency

    // Check if device fingerprint is too generic
    if (!deviceFingerprint.canvasEntropy || deviceFingerprint.canvasEntropy.length < 10) {
      consistency -= 0.3;
    }

    // Check for suspicious user agent patterns
    const userAgent = deviceFingerprint.userAgent.toLowerCase();
    if (this.suspiciousUAs.has(userAgent) || userAgent.includes("bot")) {
      consistency -= 0.4;
    }

    // Check for missing or invalid timezone
    if (!deviceFingerprint.timezone || deviceFingerprint.timezone === "UTC") {
      consistency -= 0.2;
    }

    return Math.max(consistency, 0.0);
  }

  /**
   * Calculate behavioral anomalies
   */
  private calculateBehavioralAnomalies(behaviorScore: number, _attempt: VerificationAttempt): number {
    // Normalize behavior score to 0-1 range
    const normalizedScore = Math.max(0, Math.min(1, behaviorScore));

    // Invert the score since higher behavior score should mean lower risk
    return 1.0 - normalizedScore;
  }

  /**
   * Calculate temporal patterns
   */
  private calculateTemporalPatterns(ip: string, _attempt: VerificationAttempt): number {
    let risk = 0;

    // Check for rapid successive attempts
    const recentAttempts = this.getRecentAttempts(ip, 60000); // 1 minute
    if (recentAttempts.length > 5) {
      risk += 0.4;
    }

    // Check for unusual timing patterns
    const now = Date.now();
    const hour = new Date(now).getHours();

    // Higher risk during unusual hours (2-6 AM)
    if (hour >= 2 && hour <= 6) {
      risk += 0.2;
    }

    return Math.min(risk, 1.0);
  }

  /**
   * Calculate geographic risk
   */
  private async calculateGeographicRisk(ip: string): Promise<number> {
    try {
      const ipInfo = await getIPInfo(ip);

      // Check for high-risk regions
      const highRiskRegions = ["Unknown", "Anonymous"];
      if (highRiskRegions.includes(ipInfo.country)) {
        return 0.8;
      }

      // Check for known safe regions
      const safeRegions = ["China", "United States", "Japan", "South Korea"];
      if (safeRegions.includes(ipInfo.country)) {
        return 0.2;
      }

      return 0.5; // Default risk
    } catch (error) {
      logger.error("[风险评估] 计算地理风险失败", { ip, error });
      return 0.5;
    }
  }

  /**
   * Calculate overall risk score
   */
  private calculateOverallRisk(factors: RiskFactors): number {
    // Weighted average of all risk factors
    const weights = {
      ipRisk: 0.3,
      deviceConsistency: 0.2,
      behavioralAnomalies: 0.25,
      temporalPatterns: 0.15,
      geographicRisk: 0.1,
    };

    const overallRisk =
      factors.ipRisk * weights.ipRisk +
      (1 - factors.deviceConsistency) * weights.deviceConsistency +
      factors.behavioralAnomalies * weights.behavioralAnomalies +
      factors.temporalPatterns * weights.temporalPatterns +
      factors.geographicRisk * weights.geographicRisk;

    return Math.min(Math.max(overallRisk, 0), 1);
  }

  /**
   * Determine risk level based on overall risk score
   */
  private determineRiskLevel(overallRisk: number): "LOW" | "MEDIUM" | "HIGH" | "CRITICAL" {
    if (overallRisk >= RISK_THRESHOLDS.CRITICAL) return "CRITICAL";
    if (overallRisk >= RISK_THRESHOLDS.HIGH) return "HIGH";
    if (overallRisk >= RISK_THRESHOLDS.MEDIUM) return "MEDIUM";
    return "LOW";
  }

  /**
   * Generate risk flags
   */
  private generateRiskFlags(factors: RiskFactors, _attempt: VerificationAttempt): string[] {
    const flags: string[] = [];

    if (factors.ipRisk > 0.7) flags.push("HIGH_IP_RISK");
    if (factors.deviceConsistency < 0.5) flags.push("DEVICE_INCONSISTENCY");
    if (factors.behavioralAnomalies > 0.7) flags.push("BEHAVIORAL_ANOMALY");
    if (factors.temporalPatterns > 0.6) flags.push("SUSPICIOUS_TIMING");
    if (factors.geographicRisk > 0.7) flags.push("HIGH_GEOGRAPHIC_RISK");

    return flags;
  }

  /**
   * Generate recommendations based on risk factors
   */
  private generateRecommendations(factors: RiskFactors, riskLevel: string): string[] {
    const recommendations: string[] = [];

    if (factors.ipRisk > 0.5) {
      recommendations.push("Consider IP reputation check");
    }

    if (factors.deviceConsistency < 0.6) {
      recommendations.push("Verify device fingerprint consistency");
    }

    if (factors.behavioralAnomalies > 0.5) {
      recommendations.push("Review behavioral patterns");
    }

    if (riskLevel === "HIGH" || riskLevel === "CRITICAL") {
      recommendations.push("Implement additional verification steps");
    }

    return recommendations;
  }

  /**
   * Determine if request should be blocked
   */
  private shouldBlock(overallRisk: number, flags: string[], ip: string): boolean {
    // Block if risk is critical
    if (overallRisk >= RISK_THRESHOLDS.CRITICAL) {
      return true;
    }

    // Block if IP is in blocked list
    if (this.blockedIPs.has(ip)) {
      return true;
    }

    // Block if too many high-risk flags
    const highRiskFlags = flags.filter((flag) => flag.includes("HIGH_") || flag.includes("CRITICAL_"));
    if (highRiskFlags.length >= 3) {
      return true;
    }

    return false;
  }

  /**
   * Get block reason
   */
  private getBlockReason(_factors: RiskFactors, flags: string[]): string {
    if (flags.includes("HIGH_IP_RISK")) return "Suspicious IP address";
    if (flags.includes("DEVICE_INCONSISTENCY")) return "Device fingerprint inconsistency";
    if (flags.includes("BEHAVIORAL_ANOMALY")) return "Suspicious behavior detected";
    if (flags.includes("SUSPICIOUS_TIMING")) return "Unusual access pattern";
    if (flags.includes("HIGH_GEOGRAPHIC_RISK")) return "High-risk geographic location";

    return "Multiple risk factors detected";
  }

  /**
   * Record verification attempt for pattern analysis
   */
  private recordAttempt(attempt: VerificationAttempt): void {
    const fingerprintKey = this.generateFingerprintKey(attempt.deviceFingerprint);

    // Get existing history for this fingerprint
    let history = deviceFingerprintHistory.get(fingerprintKey) || [];

    // Add new attempt
    history.push(attempt);

    // Limit history size
    if (history.length > MAX_FINGERPRINT_HISTORY) {
      history = history.slice(-MAX_FINGERPRINT_HISTORY);
    }

    // Clean old entries
    const cutoff = Date.now() - FINGERPRINT_HISTORY_TTL;
    history = history.filter((entry) => entry.timestamp > cutoff);

    deviceFingerprintHistory.set(fingerprintKey, history);

    // G7-29: maintain the IP index so getRecentAttempts is O(history for that
    // IP) instead of O(all fingerprint histories).
    const ipHistory = ipAttemptIndex.get(attempt.ip) || [];
    ipHistory.push(attempt);
    const prunedIpHistory = ipHistory
      .filter((entry) => entry.timestamp > cutoff)
      .slice(-MAX_IP_INDEX_HISTORY);
    ipAttemptIndex.set(attempt.ip, prunedIpHistory);

    // Bound the index size: if it exceeds the cap, drop entries for the least
    // recently written IPs.
    if (ipAttemptIndex.size > MAX_IP_INDEX_KEYS) {
      const oldestIp = ipAttemptIndex.keys().next().value;
      if (oldestIp !== undefined) ipAttemptIndex.delete(oldestIp);
    }
  }

  /**
   * Get recent attempts for an IP
   */
  private getRecentAttempts(ip: string, timeWindow: number): VerificationAttempt[] {
    const cutoff = Date.now() - timeWindow;
    const history = ipAttemptIndex.get(ip) || [];
    return history
      .filter((entry) => entry.timestamp > cutoff)
      .sort((a, b) => b.timestamp - a.timestamp);
  }

  /**
   * Generate fingerprint key for tracking
   */
  private generateFingerprintKey(fingerprint: DeviceFingerprint): string {
    const key = `${fingerprint.userAgent}|${fingerprint.timezone}|${fingerprint.canvasEntropy}`;
    return crypto.createHash("sha256").update(key).digest("hex");
  }
}
