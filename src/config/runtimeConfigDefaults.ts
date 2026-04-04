export interface IpqsRuntimeConfig {
  apiKeys: string[];
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

export interface RuntimeConfigDefaults {
  ipqs: IpqsRuntimeConfig;
  linuxdo: LinuxDoRuntimeConfig;
  googleAuth: GoogleAuthRuntimeConfig;
  deeplx: DeepLXRuntimeConfig;
  nexai: NexaiRuntimeConfig;
}

export function buildRuntimeConfigDefaults(options: {
  baseUrl: string;
  frontendBaseUrl: string;
  jwtSecret: string;
}): RuntimeConfigDefaults {
  const normalizedBaseUrl = options.baseUrl.replace(/\/+$/, "");
  const normalizedFrontendBaseUrl = options.frontendBaseUrl.replace(/\/+$/, "");

  return {
    ipqs: {
      apiKeys: [],
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
      clientId: "",
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
        clientId: "",
      },
      github: {
        clientId: "",
        clientSecret: "",
      },
      frontendUrl: normalizedFrontendBaseUrl,
    },
  };
}

export function cloneRuntimeConfigDefaults(config: RuntimeConfigDefaults): RuntimeConfigDefaults {
  return {
    ipqs: {
      ...config.ipqs,
      apiKeys: [...config.ipqs.apiKeys],
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
  };
}
