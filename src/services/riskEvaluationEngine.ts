import crypto from 'crypto';
import logger from '../utils/logger';
import { getIPInfo } from './ip';

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
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
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
  CRITICAL: 0.95
};

// IP reputation cache
const ipReputationCache = new Map<string, { reputation: number; timestamp: number }>();
const IP_REPUTATION_TTL = 3600000; // 1 hour

// Device fingerprint tracking
const deviceFingerprintHistory = new Map<string, VerificationAttempt[]>();
const FINGERPRINT_HISTORY_TTL = 86400000; // 24 hours
const MAX_FINGERPRINT_HISTORY = 100;

// Suspicious pattern detection
const suspiciousPatterns = new Map<string, { count: number; firstSeen: number; lastSeen: number }>();
const PATTERN_DETECTION_WINDOW = 3600000; // 1 hour

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
   * Main risk assessment method
   */
  async assessRisk(
    ip: string,
    deviceFingerprint: DeviceFingerprint,
    behaviorScore: number,
    userAgent?: string
  ): Promise<RiskAssessmentResult> {
    const attempt: VerificationAttempt = {
      ip,
      timestamp: Date.now(),
      userAgent: userAgent || deviceFingerprint.userAgent,
      deviceFingerprint,
      behaviorScore,
      success: false // Will be updated after verification
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
      geographicRisk
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
      reason
    };

    logger.info('[RiskEvaluation] Assessment completed', {
      ip: ip.slice(0, 8) + '...',
      riskLevel,
      overallRisk: Math.round(overallRisk * 100) / 100,
      blocked,
      flagCount: flags.length
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
      if (ipInfo.country === '未知' || ipInfo.country === '非法IP') {
        risk += 0.4;
      }

      // Check for high-risk countries (simplified example)
      const highRiskCountries = ['Unknown', 'Anonymous', 'Tor'];
      if (highRiskCountries.includes(ipInfo.country)) {
        risk += 0.3;
      }

      // Check for suspicious ISPs
      const suspiciousISPs = ['VPN', 'Proxy', 'Hosting', 'Cloud'];
      if (suspiciousISPs.some(isp => ipInfo.isp.toLowerCase().includes(isp.toLowerCase()))) {
        risk += 0.2;
      }

      // Check request frequency from this IP
      const recentAttempts = this.getRecentAttempts(ip, 300000); // 5 minutes
      if (recentAttempts.length > 10) {
        risk += 0.3;
      } else if (re