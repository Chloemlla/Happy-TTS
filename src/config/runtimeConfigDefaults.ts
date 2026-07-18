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

export interface RuntimeConfigDefaults {
  ipqs: IpqsRuntimeConfig;
  linuxdo: LinuxDoRuntimeConfig;
  googleAuth: GoogleAuthRuntimeConfig;
  deeplx: DeepLXRuntimeConfig;
  nexai: NexaiRuntimeConfig;
  tts: TtsRuntimeConfig;
  email: EmailRuntimeConfig;
  adminSecurity: AdminSecurityRuntimeConfig;
  synapseAndroid: SynapseAndroidRuntimeConfig;
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
      failOpen: true,
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
  };
}
