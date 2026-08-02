import { config as appConfig, startupConfig } from "./config";

export default {
  port: appConfig.port,
  openai: {
    apiKey: startupConfig.openai.apiKey,
    baseUrl: startupConfig.openai.baseUrl,
  },
  server: {
    password: startupConfig.serverPassword,
  },
  userStorageMode: "mongo",
  paths: {
    ipData: "ip_data.txt",
    lcData: "lc_data.txt",
    logs: "logs",
    finish: "finish",
    data: "data",
  },
  limits: {
    maxLines: 200,
    tts: {
      maxCalls: 5,
      period: 30000,
    },
  },
  email: {
    outemail: {
      enabled: startupConfig.email.outemail.enabled,
      domain: startupConfig.email.outemail.domain || "",
      apiKey: startupConfig.email.outemail.apiKey || "",
      code: startupConfig.email.outemail.code,
    },
  },
};
