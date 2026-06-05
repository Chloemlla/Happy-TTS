import crypto from "node:crypto";
import axios from "axios";
import { logger } from "./logger";

interface ContentFilterResponse {
  text: string;
  is_prohibited: boolean;
  confidence: number;
  status: string;
  max_variant?: string;
  triggered_variants?: Array<{
    variant: string;
    probability: number;
  }>;
}

type ContentSafetySeverity = "review" | "block";
type ContentSafetySource = "local" | "remote" | "combined";
type ContentSafetyDecision = "allow" | "review" | "block";

interface LocalRule {
  id: string;
  category: string;
  severity: ContentSafetySeverity;
  confidence: number;
  patterns: RegExp[];
}

export interface ContentSafetyFinding {
  source: "local" | "remote";
  category: string;
  severity: ContentSafetySeverity;
  confidence: number;
  ruleId?: string;
  variantHash?: string;
  variantPreview?: string;
}

export interface ContentFilterResult {
  isProhibited: boolean;
  confidence: number;
  maxVariant?: string;
  triggeredVariants?: Array<{ variant: string; probability: number }>;
  findings: ContentSafetyFinding[];
  categories: string[];
  source: ContentSafetySource;
  decision: ContentSafetyDecision;
  remoteChecked: boolean;
  remoteUnavailable?: boolean;
  error?: string;
  remoteError?: string;
}

const DEFAULT_LOCAL_RULES: LocalRule[] = [
  {
    id: "sexual-minors",
    category: "sexual_safety",
    severity: "block",
    confidence: 0.98,
    patterns: [
      /(?:未成年|儿童|幼女|幼男|小学生).{0,12}(?:色情|裸露|性行为|性暗示)/i,
      /(?:child|minor).{0,12}(?:sexual|nude|porn)/i,
    ],
  },
  {
    id: "violent-instruction",
    category: "violence",
    severity: "block",
    confidence: 0.92,
    patterns: [
      /(?:制作|自制).{0,12}(?:炸弹|爆炸物|毒药|枪支)/i,
      /(?:bomb|explosive|poison).{0,16}(?:instructions|recipe|tutorial)/i,
    ],
  },
  {
    id: "fraud-script",
    category: "fraud",
    severity: "block",
    confidence: 0.9,
    patterns: [
      /(?:冒充|伪装).{0,12}(?:客服|银行|公检法|快递).{0,20}(?:验证码|转账|银行卡)/i,
      /(?:phishing|scam).{0,16}(?:script|sms|call|message)/i,
    ],
  },
  {
    id: "hate-harassment",
    category: "hate_or_harassment",
    severity: "block",
    confidence: 0.88,
    patterns: [
      /(?:种族灭绝|民族灭绝|纳粹万岁)/i,
      /kill all (?:jews|muslims|christians|asians|black people|white people)/i,
    ],
  },
  {
    id: "self-harm-instruction",
    category: "self_harm",
    severity: "block",
    confidence: 0.9,
    patterns: [
      /(?:自杀|自残).{0,12}(?:教程|方法|步骤|指南)/i,
      /suicide.{0,12}(?:instructions|method|guide|steps)/i,
    ],
  },
  {
    id: "voice-impersonation",
    category: "copyright_or_identity",
    severity: "review",
    confidence: 0.72,
    patterns: [
      /(?:模仿|克隆|假冒).{0,12}(?:明星|名人|主播|声优|他人).{0,12}(?:声音|语音)/i,
      /(?:clone|impersonate).{0,18}(?:voice|celebrity|speaker)/i,
    ],
  },
];

function parseBooleanEnv(name: string, fallback: boolean): boolean {
  const raw = process.env[name];
  if (raw === undefined) return fallback;
  return !["false", "0", "no", "off", ""].includes(raw.trim().toLowerCase());
}

function parseNumberEnv(name: string, fallback: number, min: number, max: number): number {
  const value = Number(process.env[name]);
  if (!Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, value));
}

function parseCsvEnv(name: string): string[] {
  return (process.env[name] || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeForMatching(text: string): string {
  return text
    .normalize("NFKC")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .toLowerCase();
}

function compactForMatching(text: string): string {
  return normalizeForMatching(text).replace(/[\s\p{P}\p{S}_-]+/gu, "");
}

function hashVariant(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex").slice(0, 16);
}

function previewVariant(value: string): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (!normalized) return "";
  if (normalized.length <= 12) return normalized;
  return `${normalized.slice(0, 6)}...${normalized.slice(-4)}`;
}

function buildCustomBlockRules(): LocalRule[] {
  const terms = parseCsvEnv("CONTENT_SAFETY_CUSTOM_BLOCKLIST");
  if (!terms.length) return [];

  return terms.map((term, index) => ({
    id: `custom-block-${index + 1}`,
    category: "custom_blocklist",
    severity: "block",
    confidence: 0.95,
    patterns: [new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i")],
  }));
}

function evaluateLocalRules(text: string): ContentSafetyFinding[] {
  const normalized = normalizeForMatching(text);
  const compacted = compactForMatching(text);
  const target = `${normalized}\n${compacted}`;
  const rules = [...DEFAULT_LOCAL_RULES, ...buildCustomBlockRules()];
  const findings: ContentSafetyFinding[] = [];

  for (const rule of rules) {
    for (const pattern of rule.patterns) {
      const match = target.match(pattern);
      if (!match) continue;

      const variant = match[0] || rule.id;
      findings.push({
        source: "local",
        category: rule.category,
        severity: rule.severity,
        confidence: rule.confidence,
        ruleId: rule.id,
        variantHash: hashVariant(variant),
        variantPreview: previewVariant(variant),
      });
      break;
    }
  }

  return findings;
}

function buildResult(params: {
  findings: ContentSafetyFinding[];
  source: ContentSafetySource;
  remoteChecked: boolean;
  baselineConfidence?: number;
  remoteUnavailable?: boolean;
  error?: string;
  remoteError?: string;
  maxVariant?: string;
  triggeredVariants?: Array<{ variant: string; probability: number }>;
}): ContentFilterResult {
  const confidence = params.findings.reduce(
    (max, finding) => Math.max(max, finding.confidence),
    params.baselineConfidence ?? 0,
  );
  const hasBlockFinding = params.findings.some((finding) => finding.severity === "block");
  const hasReviewFinding = params.findings.some((finding) => finding.severity === "review");
  const blockThreshold = parseNumberEnv("CONTENT_SAFETY_BLOCK_THRESHOLD", 0.85, 0, 1);
  const reviewThreshold = parseNumberEnv("CONTENT_SAFETY_REVIEW_THRESHOLD", 0.6, 0, 1);
  const isProhibited = hasBlockFinding || confidence >= blockThreshold || Boolean(params.error);
  const decision: ContentSafetyDecision = isProhibited
    ? "block"
    : hasReviewFinding || confidence >= reviewThreshold
      ? "review"
      : "allow";

  return {
    isProhibited,
    confidence,
    maxVariant: params.maxVariant,
    triggeredVariants: params.triggeredVariants,
    findings: params.findings,
    categories: Array.from(new Set(params.findings.map((finding) => finding.category))),
    source: params.source,
    decision,
    remoteChecked: params.remoteChecked,
    remoteUnavailable: params.remoteUnavailable,
    error: params.error,
    remoteError: params.remoteError,
  };
}

export class ContentFilterService {
  private static readonly API_URL = process.env.CONTENT_FILTER_API_URL || "https://v2.xxapi.cn/api/detect";
  private static readonly TIMEOUT = parseNumberEnv("CONTENT_FILTER_TIMEOUT_MS", 5000, 1000, 30000);

  public static evaluateLocalContent(text: string): ContentFilterResult {
    if (!text || text.trim().length === 0) {
      return buildResult({ findings: [], source: "local", remoteChecked: false });
    }

    return buildResult({
      findings: evaluateLocalRules(text),
      source: "local",
      remoteChecked: false,
    });
  }

  /**
   * Detects prohibited text with a local safety layer and an optional remote service.
   */
  public static async detectProhibitedContent(text: string): Promise<ContentFilterResult> {
    if (!text || text.trim().length === 0) {
      return buildResult({ findings: [], source: "combined", remoteChecked: false });
    }

    const localResult = ContentFilterService.evaluateLocalContent(text);
    if (localResult.isProhibited) {
      logger.warn("Content safety blocked text with local rules", {
        categories: localResult.categories,
        confidence: localResult.confidence,
        findings: localResult.findings.map((finding) => ({
          ruleId: finding.ruleId,
          category: finding.category,
          severity: finding.severity,
          variantHash: finding.variantHash,
        })),
      });
      return { ...localResult, source: "local" };
    }

    if (!parseBooleanEnv("CONTENT_FILTER_REMOTE_ENABLED", true)) {
      return localResult;
    }

    try {
      const response = await axios.get<ContentFilterResponse>(ContentFilterService.API_URL, {
        params: { text: text.trim() },
        timeout: ContentFilterService.TIMEOUT,
        headers: {
          "User-Agent": "Synapse/1.0",
        },
      });

      const result = response.data;
      const remoteFindings: ContentSafetyFinding[] = result.is_prohibited
        ? [
            {
              source: "remote",
              category: "remote_policy",
              severity: "block",
              confidence: Number(result.confidence) || 1,
              variantHash: result.max_variant ? hashVariant(result.max_variant) : undefined,
              variantPreview: result.max_variant ? previewVariant(result.max_variant) : undefined,
            },
          ]
        : [];

      if (result.is_prohibited) {
        logger.warn("Content safety blocked text with remote detector", {
          confidence: result.confidence,
          maxVariantHash: result.max_variant ? hashVariant(result.max_variant) : undefined,
          triggeredVariants: result.triggered_variants?.map((variant) => ({
            variantHash: hashVariant(variant.variant),
            probability: variant.probability,
          })),
        });
      }

      return buildResult({
        findings: [...localResult.findings, ...remoteFindings],
        source: remoteFindings.length ? "combined" : "remote",
        remoteChecked: true,
        baselineConfidence: Number(result.confidence) || 0,
        maxVariant: result.max_variant,
        triggeredVariants: result.triggered_variants,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const failClosed = parseBooleanEnv("CONTENT_FILTER_FAIL_CLOSED", true);

      logger.error("Content safety remote detector unavailable", {
        error: message,
        textHash: hashVariant(text),
        textLength: text.length,
        failClosed,
      });

      if (!failClosed) {
        return buildResult({
          findings: localResult.findings,
          source: "combined",
          remoteChecked: true,
          remoteUnavailable: true,
          remoteError: message,
        });
      }

      return buildResult({
        findings: [
          ...localResult.findings,
          {
            source: "remote",
            category: "remote_unavailable",
            severity: "block",
            confidence: 1,
          },
        ],
        source: "combined",
        remoteChecked: true,
        remoteUnavailable: true,
        error: "内容安全检测服务暂时不可用，请稍后重试",
        remoteError: message,
      });
    }
  }

  public static async batchDetect(texts: string[]): Promise<
    Array<{
      text: string;
      isProhibited: boolean;
      confidence: number;
      categories?: string[];
      decision?: ContentSafetyDecision;
      error?: string;
    }>
  > {
    const results = [];

    for (const text of texts) {
      const result = await ContentFilterService.detectProhibitedContent(text);
      results.push({
        text,
        isProhibited: result.isProhibited,
        confidence: result.confidence,
        categories: result.categories,
        decision: result.decision,
        error: result.error,
      });
    }

    return results;
  }

  public static shouldSkipDetection(): boolean {
    return (
      process.env.NODE_ENV === "test" ||
      process.env.SKIP_CONTENT_FILTER === "true" ||
      process.env.CONTENT_SAFETY_ENABLED === "false"
    );
  }
}
