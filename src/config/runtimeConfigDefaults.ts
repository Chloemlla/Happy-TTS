import {
  EDGE_DEFAULT_BASE_URL,
  EDGE_DEFAULT_VOICE,
  EDGE_MODEL_ID,
  FISH_AUDIO_DEFAULT_BASE_URL,
  FISH_AUDIO_DEFAULT_MODEL,
  normalizeFishAudioBaseUrl,
  normalizeTtsModelId,
  normalizeTtsProviderId,
  type TtsProviderRuntimeConfig,
} from "./ttsProviderConfig";

export interface IpqsRuntimeConfig {
  apiKeys: string[];
  scamalyticsUser?: string;
  enabled: boolean;
  strictness: number;
  allowPublicAccessPoints: boolean;
  lighterPenalties: boolean;
  timeoutMs: number;
  monthlyQuotaPerKey: number;
  challengeFraudScore: number;
  tokenTtlMinutes: number;
  failOpen: boolean;
}

export interface LinuxDoRuntimeConfig {
  clientId: string;
  clientSecret: string;
  discoveryUrl: string;
  scopes: string;
  authorizationEndpoint: string;
  tokenEndpoint: string;
  userEndpoint: string;
  forumBaseUrl: string;
  callbackUrl: string;
  frontendCallbackUrl: string;
}

/** LINUX DO Credit (积分支付) merchant settings — separate from Connect OAuth. */
export interface LinuxDoCreditRuntimeConfig {
  enabled: boolean;
  pid: string;
  key: string;
  protocol: "epay" | "ldc";
  gatewayBase: string;
  privateKey: string;
  creditRate: number;
  maxMoney: number;
  notifyUrl: string;
  returnUrl: string;
}

export interface GoogleAuthRuntimeConfig {
  clientId: string;
}

export interface DeepLXRuntimeConfig {
  baseUrl: string;
  apiKey: string;
}

export interface NexaiRuntimeConfig {
  jwtSecret: string;
  jwtExpiresIn: string;
  refreshExpiresIn: string;
  google: {
    clientId: string;
  };
  github: {
    clientId: string;
    clientSecret: string;
  };
  frontendUrl: string;
}

export interface TtsRuntimeConfig {
  generationCode: string;
}

export interface EmailRuntimeConfig {
  enabled: boolean;
  resendDomain: string;
  resendApiKey: string;
  quotaTotal: number;
  outemailEnabled: boolean;
  outemailDomain: string;
  outemailApiKey: string;
  outemailCode: string;
  outemailQuotaTotal: number;
}

export interface AdminSecurityRuntimeConfig {
  operationPassword: string;
  serverStatusPassword: string;
  publicShortUrlEnabled: boolean;
  publicShortUrlPassword: string;
}

export interface SynapseAndroidRuntimeConfig {
  /** Android applicationId / package name for Digital Asset Links */
  packageName: string;
  /** Colon-separated SHA-256 cert fingerprints for release (and optional debug) */
  sha256CertFingerprints: string[];
  /**
   * Optional Google Web Client ID for Android Credential Manager SIWG serverClientId.
   * Empty means fall back to main googleAuth.clientId / GOOGLE_CLIENT_ID.
   */
  googleClientId: string;
  /** When true, assetlinks.json omits Synapse Android statements from this config */
  disabled: boolean;
}

/** Runtime-mutable settings consumed by the NexAI request-signature middleware. */
export interface NexaiSigningRuntimeConfig {
  mode: "off" | "soft" | "enforce";
  appSignSecret: string;
  appSignSecretPrev: string;
  maxDriftMs: number;
}

/**
 * Settings consumed by the CDict official-client signature middleware. Unlike
 * NexAI signing this never gates access — it only decides which rate-limit tier
 * a request lands in, so `soft` is the safe default for a public API.
 */
export interface CdictSigningRuntimeConfig {
  mode: "off" | "soft" | "enforce";
  appSignSecret: string;
  appSignSecretPrev: string;
  maxDriftMs: number;
}

/**
 * QQ 群纪律机器人 → Synapse 控制通道的共享 HMAC 密钥。
 * Mirror of QQ_GUARD_BOT_TOKEN / QQ_GUARD_SHARED_SECRET env; a stored QQ_GUARD_SIGNING
 * doc overrides the env-seeded default at runtime (see src/routes/qqGuardRoutes.ts).
 */
export interface QqGuardSigningRuntimeConfig {
  token: string;
  /** bot 离线/恢复告警收件邮箱（逗号分隔；空串 = 关闭邮件告警）。 */
  alertEmails: string;
}

/**
 * proxycheck.io IP 风险查询 + 客户端出口探测（HMAC 验签）配置。
 * 注意本配置里有**两把用途相反**的 HMAC 密钥，别混：
 * - `payloadVerificationKey`：proxycheck 官方 Dashboard 的 API Payload Verification Key
 *   （64 字符），用来校验**上游响应**的 `http_x_signature` 头，只进上游请求的验签环节。
 * - `hmacSecret`：本服务自建的主密钥，用来签发/校验**浏览器上报**的出口探测遥测。
 * 两者都只在服务端使用，绝不下发。
 * Mirror of the PROXYCHECK_* env vars; a stored PROXYCHECK doc overrides the
 * env-seeded defaults at runtime (see src/services/ipRiskService.ts).
 */
export interface ProxycheckRuntimeConfig {
  /** 总开关，默认 false（未配置 key 前不得外呼）。 */
  enabled: boolean;
  /** 服务端 key（4 段式），绝不下发到浏览器。 */
  apiKey: string;
  /** 浏览器/CORS key（public-######-######-######）。 */
  publicApiKey: string;
  /** proxycheck 官方的响应验签密钥（64 字符）；空串 = 不验签，只依赖 TLS。 */
  payloadVerificationKey: string;
  /** 自建 API payload 验签主密钥（校验浏览器上报，服务端专用，绝不下发）。 */
  hmacSecret: string;
  /** 同 IP 去重 TTL 小时数。 */
  cacheTtlHours: number;
  timeoutMs: number;
  /** 每把 key 的每日查询额度。 */
  dailyQuotaPerKey: number;
  /** 风险分达到该值即挑战（0..100）。 */
  challengeRiskScore: number;
  /** proxycheck 是辅助信号而非唯一闸门，默认上游失败时放行。 */
  failOpen: boolean;
  /** 是否把 publicApiKey 下发给前端做直连查询。 */
  usePublicKeyForClient: boolean;
}

/**
 * Runtime-mutable settings consumed by the Project Lumen subsystem
 * (src/config/lumen.ts). Mirror of the LUMEN_* environment variables; a stored
 * LUMEN doc overrides the env-seeded defaults at runtime (see runtimeConfigService).
 */
export interface LumenRuntimeConfig {
  /** Whether the /api/lumen routes are served. Deployment can force it via LUMEN_ENABLED. */
  enabled: boolean;
  adminUsername: string;
  adminPassword: string;
  adminAutomationToken: string;
  requestSigningSecret: string;
  requireRequestSigning: boolean;
  acceptUnverifiedPurchases: boolean;
  outemailApiKey: string;
  outemailApiUrl: string;
  appVersion: string;
  sessionTtlDays: number;
  loginCodeTtlSeconds: number;
  adminSessionTtlSeconds: number;
  adminRefreshTtlSeconds: number;
  accessTokenTtlSeconds: number;
  refreshTokenTtlSeconds: number;
  devLoginCode: string;
  requestTimestampSkewSeconds: number;
  allowPublicReleaseCheck: boolean;
  outemailFrom: string;
  outemailDisplayName: string;
  outemailDomain: string;
  outemailTimeoutSeconds: number;
  outemailBaseUrl: string;
}

/**
 * 注册邀请码闸门。**仅由 env-manager 的「注册邀请码」分区维护**；REGISTRATION_INVITE_REQUIRED
 * 环境变量只作启动默认值（见 src/config/config.ts），运行期一律以本运行时配置为准。
 */
export interface RegistrationInviteRuntimeConfig {
  /** true = 本地账号注册必须提供有效邀请码；false = 邀请码可选（填了仍然校验）。 */
  required: boolean;
}

/**
 * 首访验证闸门（`config.enableFirstVisitVerification`）。**仅由 env-manager 的「首访验证闸门」分区维护**；
 * ENABLE_FIRST_VISIT_VERIFICATION 环境变量只作启动默认值（见 src/config/config.ts），
 * 运行期一律以本运行时配置为准。它同时是 proxycheck `first_visit_gate` 的前置开关：
 * 关闭后 `ipVerificationService.initializeSession` 直接放行，proxycheck 那条闸门也不再评估
 * （proxycheck 自身的开关在 PROXYCHECK 分区）。影响面比名字大：Turnstile/hCaptcha 校验、
 * 访问令牌签发、`/api/ip-verification` 中间件全部读同一个值。
 */
export interface FirstVisitVerificationRuntimeConfig {
  /** true = 首访需通过 IP/Turnstile 验证；false = 一律视为已验证（放行）。 */
  enabled: boolean;
}

export interface RuntimeConfigDefaults {
  ipqs: IpqsRuntimeConfig;
  linuxdo: LinuxDoRuntimeConfig;
  linuxdoCredit: LinuxDoCreditRuntimeConfig;
  googleAuth: GoogleAuthRuntimeConfig;
  deeplx: DeepLXRuntimeConfig;
  nexai: NexaiRuntimeConfig;
  tts: TtsRuntimeConfig;
  ttsProvider: TtsProviderRuntimeConfig;
  email: EmailRuntimeConfig;
  adminSecurity: AdminSecurityRuntimeConfig;
  synapseAndroid: SynapseAndroidRuntimeConfig;
  nexaiSigning: NexaiSigningRuntimeConfig;
  cdictSigning: CdictSigningRuntimeConfig;
  qqGuardSigning: QqGuardSigningRuntimeConfig;
  proxycheck: ProxycheckRuntimeConfig;
  registrationInvite: RegistrationInviteRuntimeConfig;
  firstVisitVerification: FirstVisitVerificationRuntimeConfig;
  lumen: LumenRuntimeConfig;
}

export function buildRuntimeConfigDefaults(options: {
  baseUrl: string;
  frontendBaseUrl: string;
  jwtSecret: string;
  adminPassword: string;
  serverStatusPassword: string;
  publicShortUrlEnabled: boolean;
  publicShortUrlPassword?: string;
  generationCode: string;
  ttsProvider?: string;
  ttsDefaultModel?: string;
  openAiDefaultModel?: string;
  fishAudioApiKey?: string;
  fishAudioBaseUrl?: string;
  fishAudioReferenceId?: string;
  fishAudioModel?: string;
  email: EmailRuntimeConfig;
  googleClientId?: string;
  nexaiGoogleClientId?: string;
  synapseAndroidPackageName?: string;
  synapseAndroidSha256CertFingerprints?: string[];
  synapseAndroidGoogleClientId?: string;
  synapseAndroidDisabled?: boolean;
}): RuntimeConfigDefaults {
  const normalizedBaseUrl = options.baseUrl.replace(/\/+$/, "");
  const normalizedFrontendBaseUrl = options.frontendBaseUrl.replace(/\/+$/, "");
  const googleClientId = (options.googleClientId || "").trim();
  const nexaiGoogleClientId = (options.nexaiGoogleClientId || options.googleClientId || "").trim();
  const synapseAndroidSha256CertFingerprints =
    options.synapseAndroidSha256CertFingerprints?.map((item) => item.trim()).filter(Boolean) || [];
  const ttsProvider = normalizeTtsProviderId(options.ttsProvider, "openai");
  const providerModelFallback =
    ttsProvider === "fish"
      ? normalizeTtsModelId(options.fishAudioModel, FISH_AUDIO_DEFAULT_MODEL)
      : ttsProvider === "edge"
        ? EDGE_MODEL_ID
        : normalizeTtsModelId(options.openAiDefaultModel, "tts-1");
  const ttsDefaultModel = normalizeTtsModelId(
    options.ttsDefaultModel || (ttsProvider === "openai" ? options.openAiDefaultModel : undefined),
    providerModelFallback,
  );

  return {
    ipqs: {
      apiKeys: ["api"],
      scamalyticsUser: "happyclovo",
      enabled: false,
      strictness: 1,
      allowPublicAccessPoints: false,
      lighterPenalties: true,
      timeoutMs: 8000,
      monthlyQuotaPerKey: 5000,
      challengeFraudScore: 75,
      tokenTtlMinutes: 40,
      failOpen: false,
    },
    linuxdo: {
      clientId: "",
      clientSecret: "",
      discoveryUrl: "https://connect.linux.do/.well-known/openid-configuration",
      scopes: "openid profile email",
      authorizationEndpoint: "https://connect.linux.do/oauth2/authorize",
      tokenEndpoint: "https://connect.linux.do/oauth2/token",
      userEndpoint: "https://connect.linux.do/api/user",
      forumBaseUrl: "https://linux.do",
      callbackUrl: `${normalizedBaseUrl}/api/auth/linuxdo/callback`,
      frontendCallbackUrl: `${normalizedFrontendBaseUrl}/auth/linuxdo/callback`,
    },
    linuxdoCredit: {
      enabled: false,
      pid: "",
      key: "",
      protocol: "epay",
      gatewayBase: "https://credit.linux.do/epay",
      privateKey: "",
      creditRate: 1,
      maxMoney: 10000,
      notifyUrl: `${normalizedBaseUrl}/api/linuxdo-credit/notify`,
      returnUrl: `${normalizedFrontendBaseUrl}/api-keys`,
    },
    googleAuth: {
      clientId: googleClientId,
    },
    deeplx: {
      baseUrl: "https://api.deeplx.org",
      apiKey: "",
    },
    nexai: {
      jwtSecret: `${options.jwtSecret}_nexai`,
      jwtExpiresIn: "2h",
      refreshExpiresIn: "30d",
      google: {
        clientId: nexaiGoogleClientId,
      },
      github: {
        clientId: "",
        clientSecret: "",
      },
      frontendUrl: normalizedFrontendBaseUrl,
    },
    tts: {
      generationCode: options.generationCode,
    },
    ttsProvider: {
      provider: ttsProvider,
      enabledProviders: [ttsProvider],
      defaultModel: ttsDefaultModel,
      fish: {
        apiKey: options.fishAudioApiKey?.trim() || "",
        baseUrl: normalizeFishAudioBaseUrl(options.fishAudioBaseUrl, FISH_AUDIO_DEFAULT_BASE_URL),
        referenceId: options.fishAudioReferenceId?.trim() || "",
        catalog: {},
      },
      edge: {
        baseUrl: EDGE_DEFAULT_BASE_URL,
        defaultVoice: EDGE_DEFAULT_VOICE,
        voices: [],
      },
    },
    email: {
      ...options.email,
    },
    adminSecurity: {
      operationPassword: options.adminPassword,
      serverStatusPassword: options.serverStatusPassword,
      publicShortUrlEnabled: options.publicShortUrlEnabled,
      publicShortUrlPassword: options.publicShortUrlPassword || "",
    },
    synapseAndroid: {
      packageName: options.synapseAndroidPackageName?.trim() || "com.chloemlla.synapse.mobile",
      sha256CertFingerprints:
        synapseAndroidSha256CertFingerprints.length > 0
          ? synapseAndroidSha256CertFingerprints
          : ["E9:D8:5A:D2:52:C3:8D:86:C6:E4:B2:A8:C0:49:B8:B5:A9:FA:79:AC:6E:BB:11:8C:94:0A:83:03:B6:96:39:98"],
      googleClientId: options.synapseAndroidGoogleClientId?.trim() || "",
      disabled: options.synapseAndroidDisabled === true,
    },
    nexaiSigning: {
      mode: "soft",
      appSignSecret: "",
      appSignSecretPrev: "",
      maxDriftMs: 5 * 60 * 1000,
    },
    cdictSigning: {
      mode: "soft",
      appSignSecret: "",
      appSignSecretPrev: "",
      maxDriftMs: 5 * 60 * 1000,
    },
    qqGuardSigning: {
      token: "",
      alertEmails: "",
    },
    proxycheck: {
      enabled: false,
      apiKey: "api",
      publicApiKey: "",
      payloadVerificationKey: "",
      hmacSecret: "",
      cacheTtlHours: 24,
      timeoutMs: 8000,
      dailyQuotaPerKey: 1000,
      challengeRiskScore: 66,
      failOpen: true,
      usePublicKeyForClient: true,
    },
    // 默认关闭：存量部署未显式配置时不得凭空收紧注册入口（env 由 config.ts 覆盖）。
    registrationInvite: {
      required: false,
    },
    // 默认开启：与「ENABLE_FIRST_VISIT_VERIFICATION 未设置 = true」的历史默认值一致，
    // 存量部署未显式配置时不得凭空放宽首访验证（env 由 config.ts 覆盖）。
    firstVisitVerification: {
      enabled: true,
    },
    lumen: {
      enabled: false,
      adminUsername: "admin",
      adminPassword: "",
      adminAutomationToken: "",
      requestSigningSecret: "",
      requireRequestSigning: false,
      acceptUnverifiedPurchases: false,
      outemailApiKey: "",
      outemailApiUrl: "",
      appVersion: "0.1.0",
      sessionTtlDays: 90,
      loginCodeTtlSeconds: 300,
      adminSessionTtlSeconds: 3600,
      adminRefreshTtlSeconds: 604800,
      accessTokenTtlSeconds: 7200,
      refreshTokenTtlSeconds: 2592000,
      devLoginCode: "",
      requestTimestampSkewSeconds: 300,
      allowPublicReleaseCheck: true,
      outemailFrom: "noreply",
      outemailDisplayName: "Project Lumen",
      outemailDomain: "",
      outemailTimeoutSeconds: 10,
      outemailBaseUrl: "https://chloemlla.com",
    },
  };
}

export function cloneRuntimeConfigDefaults(config: RuntimeConfigDefaults): RuntimeConfigDefaults {
  return {
    ipqs: {
      ...config.ipqs,
      apiKeys: [...config.ipqs.apiKeys],
      scamalyticsUser: config.ipqs.scamalyticsUser,
    },
    linuxdo: {
      ...config.linuxdo,
    },
    linuxdoCredit: {
      ...config.linuxdoCredit,
    },
    googleAuth: {
      ...config.googleAuth,
    },
    deeplx: {
      ...config.deeplx,
    },
    nexai: {
      ...config.nexai,
      google: {
        ...config.nexai.google,
      },
      github: {
        ...config.nexai.github,
      },
    },
    tts: {
      ...config.tts,
    },
    ttsProvider: {
      ...config.ttsProvider,
      enabledProviders: [
        ...(config.ttsProvider.enabledProviders ?? [config.ttsProvider.provider]),
      ],
      fish: {
        ...config.ttsProvider.fish,
        catalog: {
          ...config.ttsProvider.fish.catalog,
          ...(config.ttsProvider.fish.catalog?.modelRequest
            ? { modelRequest: { ...config.ttsProvider.fish.catalog.modelRequest, headers: { ...config.ttsProvider.fish.catalog.modelRequest.headers } } }
            : {}),
          ...(config.ttsProvider.fish.catalog?.defaultVoicesRequest
            ? { defaultVoicesRequest: { ...config.ttsProvider.fish.catalog.defaultVoicesRequest, headers: { ...config.ttsProvider.fish.catalog.defaultVoicesRequest.headers } } }
            : {}),
        },
      },
      edge: {
        ...config.ttsProvider.edge,
        voices: config.ttsProvider.edge.voices.map((entry) => ({ ...entry })),
      },
    },
    email: {
      ...config.email,
    },
    adminSecurity: {
      ...config.adminSecurity,
    },
    synapseAndroid: {
      ...config.synapseAndroid,
      sha256CertFingerprints: [...config.synapseAndroid.sha256CertFingerprints],
    },
    nexaiSigning: {
      ...config.nexaiSigning,
    },
    cdictSigning: {
      ...config.cdictSigning,
    },
    qqGuardSigning: {
      ...config.qqGuardSigning,
    },
    proxycheck: {
      ...config.proxycheck,
    },
    registrationInvite: {
      ...config.registrationInvite,
    },
    firstVisitVerification: {
      ...config.firstVisitVerification,
    },
    lumen: {
      ...config.lumen,
    },
  };
}
