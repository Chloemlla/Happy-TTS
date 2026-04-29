import { join } from "node:path";
import { config as appConfig, startupConfig } from "./config/config";

const config = {
  port: appConfig.port,
  openai: {
    apiKey: startupConfig.openai.apiKey,
    baseUrl: startupConfig.openai.baseUrl,
  },
  server: {
    password: startupConfig.serverPassword,
  },
  email: {
    outemail: {
      enabled: startupConfig.email.outemail.enabled,
      domain: startupConfig.email.outemail.domain || "",
      apiKey: startupConfig.email.outemail.apiKey || "",
      code: startupConfig.email.outemail.code,
    },
  },
  paths: {
    ipData: join(__dirname, "../data/ip_data.json"),
    lcData: join(__dirname, "../data/lc_data.json"),
    logs: join(__dirname, "../data/logs"),
    finish: join(__dirname, "../data/finish"),
    data: join(__dirname, "../data"),
  },
  limits: {
    maxRequestsPerMinute: 60,
    maxRequestsPerHour: 1000,
    maxRequestsPerDay: 10000,
  },
  ip: {
    whitelist: (process.env.IP_WHITELIST || "").split(",").filter(Boolean),
  },
};

export default config;
