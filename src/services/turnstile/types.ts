export interface TurnstileResponse {
  success: boolean;
  "error-codes"?: string[];
  challenge_ts?: string;
  hostname?: string;
}

export interface HCaptchaResponse {
  success: boolean;
  "error-codes"?: string[];
  challenge_ts?: string;
  hostname?: string;
  credit?: boolean;
  score?: number;
  score_reason?: string[];
}

export interface RiskAssessment {
  riskLevel: string;
  riskScore: number;
  riskReasons: string[];
}

export interface RiskAssessmentDetail {
  riskLevel: "low" | "medium" | "high";
  riskScore: number;
  riskReasons: string[];
  scoreBreakdown: any;
}

export interface TurnstileVerificationFailure {
  success: false;
  reason: string;
  errorCode: string;
  errorMessage: string;
  retryable: boolean;
  timestamp: string;
  clientInfo: {
    ip: string;
    userAgent?: string;
    fingerprint?: string;
  };
  riskAssessment?: RiskAssessment;
  violationInfo?: {
    violationCount: number;
    banned: boolean;
    banExpiresAt?: Date;
  };
  traceId?: string;
}

export interface TurnstileVerificationSuccess {
  success: true;
  timestamp: string;
  clientInfo: {
    ip: string;
    userAgent?: string;
    fingerprint?: string;
  };
  riskAssessment?: RiskAssessment;
  accessToken?: string;
  traceId?: string;
}

export type TurnstileVerificationResult = TurnstileVerificationSuccess | TurnstileVerificationFailure;

export interface TurnstileSettingDoc {
  key: string;
  value: string;
  updatedAt?: Date;
}

export interface HCaptchaSettingDoc {
  key: string;
  value: string;
  updatedAt?: Date;
}
