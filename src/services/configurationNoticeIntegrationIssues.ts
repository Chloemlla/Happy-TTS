import { config, runtimeMutableConfig } from "../config/config";
import {
  createConfigurationIssue,
  type MissingConfigurationIssue,
} from "./configurationNoticeIssueTypes";

export function appendIntegrationConfigurationIssues(issues: MissingConfigurationIssue[]): void {
  const email = runtimeMutableConfig.email;
  if (!email.resendApiKey) {
    issues.push(
      createConfigurationIssue(
        "resend-email",
        "邮件发送",
        ["RESEND_API_KEY"],
        "邮件发送请求会返回服务未配置",
      ),
    );
  }
  if (email.outemailEnabled) {
    const missing = [
      ...(!email.outemailDomain ? ["OUTEMAIL_DOMAIN"] : []),
      ...(!email.outemailApiKey ? ["OUTEMAIL_API_KEY", "RESEND_API_KEY"] : []),
    ];
    if (missing.length > 0) {
      issues.push(createConfigurationIssue("outemail", "对外邮件服务", missing, "对外邮件发送保持禁用"));
    }
  }

  const linuxdo = runtimeMutableConfig.linuxdo;
  const missingLinuxDo = [
    ...(!linuxdo.clientId ? ["LINUXDO_CLIENT_ID"] : []),
    ...(!linuxdo.clientSecret ? ["LINUXDO_CLIENT_SECRET"] : []),
  ];
  if (missingLinuxDo.length > 0) {
    issues.push(
      createConfigurationIssue(
        "linuxdo-oauth",
        "Linux.do 登录",
        missingLinuxDo,
        "Linux.do 登录请求会返回未配置",
      ),
    );
  }

  if (!runtimeMutableConfig.googleAuth.clientId) {
    issues.push(
      createConfigurationIssue(
        "google-oauth",
        "Google 登录",
        ["GOOGLE_CLIENT_ID"],
        "Google 登录请求会返回未配置",
      ),
    );
  }

  const nexai = runtimeMutableConfig.nexai;
  if (!nexai.google.clientId) {
    issues.push(
      createConfigurationIssue(
        "nexai-google-oauth",
        "NexAI Google 登录",
        ["NEXAI_GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_ID"],
        "NexAI Google 登录请求会返回未配置",
      ),
    );
  }
  const missingNexaiGithub = [
    ...(!nexai.github.clientId ? ["NEXAI_GITHUB_CLIENT_ID"] : []),
    ...(!nexai.github.clientSecret ? ["NEXAI_GITHUB_CLIENT_SECRET"] : []),
  ];
  if (missingNexaiGithub.length > 0) {
    issues.push(
      createConfigurationIssue(
        "nexai-github-oauth",
        "NexAI GitHub 登录",
        missingNexaiGithub,
        "NexAI GitHub 登录请求会返回未配置",
      ),
    );
  }

  const nexaiSigning = runtimeMutableConfig.nexaiSigning;
  if (nexaiSigning.mode !== "off" && !nexaiSigning.appSignSecret) {
    issues.push(
      createConfigurationIssue(
        "nexai-request-signing",
        "NexAI 请求签名",
        ["NEXAI_APP_SIGN_SECRET"],
        "无会话的已签名 NexAI 请求无法通过签名校验",
      ),
    );
  }

  const linuxdoCredit = config.linuxdoCredit;
  if (
    linuxdoCredit.enabled &&
    (!linuxdoCredit.pid ||
      !linuxdoCredit.key ||
      (linuxdoCredit.protocol === "ldc" && !linuxdoCredit.privateKey))
  ) {
    const missing = [
      ...(!linuxdoCredit.pid ? ["LINUXDO_CREDIT_PID"] : []),
      ...(!linuxdoCredit.key ? ["LINUXDO_CREDIT_KEY"] : []),
      ...(linuxdoCredit.protocol === "ldc" && !linuxdoCredit.privateKey
        ? ["LINUXDO_CREDIT_PRIVATE_KEY"]
        : []),
    ];
    issues.push(
      createConfigurationIssue("linuxdo-credit", "LINUX DO Credit", missing, "积分支付能力保持禁用"),
    );
  }

  if (runtimeMutableConfig.ipqs.enabled) {
    const hasIpqsKey = runtimeMutableConfig.ipqs.apiKeys.some((value) => value.trim().length > 0);
    if (!hasIpqsKey && !runtimeMutableConfig.ipqs.scamalyticsUser?.trim()) {
      issues.push(
        createConfigurationIssue(
          "ip-reputation",
          "IP 风险检测",
          ["IPQS_API_KEY", "SCAMALYTICS_API_KEY"],
          "IP 风险检测会按当前 fail-open/fail-closed 策略降级",
        ),
      );
    }
  }

  const missingEcoTokenSecrets = [
    ...(!(
      process.env.ECOENCHANTS_LICENSE_PEPPER?.trim() || process.env.LICENSE_KEY_PEPPER?.trim()
    )
      ? ["ECOENCHANTS_LICENSE_PEPPER", "LICENSE_KEY_PEPPER"]
      : []),
    ...(!(
      process.env.ECOENCHANTS_ACTIVATION_TOKEN_SECRET?.trim() ||
      process.env.ECOENCHANTS_RUNTIME_TOKEN_SECRET?.trim()
    )
      ? ["ECOENCHANTS_ACTIVATION_TOKEN_SECRET", "ECOENCHANTS_RUNTIME_TOKEN_SECRET"]
      : []),
    ...(!process.env.ECOENCHANTS_OPS_TOKEN_SECRET?.trim() ? ["ECOENCHANTS_OPS_TOKEN_SECRET"] : []),
    ...(!process.env.ECOENCHANTS_DOWNLOAD_TOKEN_SECRET?.trim()
      ? ["ECOENCHANTS_DOWNLOAD_TOKEN_SECRET"]
      : []),
    ...(!process.env.ECOENCHANTS_DOWNLOAD_URL_SIGNING_SECRET?.trim()
      ? ["ECOENCHANTS_DOWNLOAD_URL_SIGNING_SECRET"]
      : []),
  ];
  if (missingEcoTokenSecrets.length > 0) {
    issues.push(
      createConfigurationIssue(
        "ecoenchants-token-secrets",
        "EcoEnchants 令牌与许可证密钥",
        missingEcoTokenSecrets,
        "相关令牌会使用共享会话密钥或不附加下载签名",
      ),
    );
  }

  const missingEcoWebhookSecrets = [
    ...(!(
      process.env.ECOENCHANTS_STRIPE_WEBHOOK_SECRET?.trim() ||
      process.env.STRIPE_WEBHOOK_SECRET?.trim()
    )
      ? ["ECOENCHANTS_STRIPE_WEBHOOK_SECRET", "STRIPE_WEBHOOK_SECRET"]
      : []),
    ...(!(
      process.env.ECOENCHANTS_POLYMART_WEBHOOK_SECRET?.trim() ||
      process.env.POLYMART_WEBHOOK_SECRET?.trim()
    )
      ? ["ECOENCHANTS_POLYMART_WEBHOOK_SECRET", "POLYMART_WEBHOOK_SECRET"]
      : []),
    ...(!(
      process.env.ECOENCHANTS_PAYPAL_WEBHOOK_SECRET?.trim() ||
      process.env.PAYPAL_WEBHOOK_SECRET?.trim()
    )
      ? ["ECOENCHANTS_PAYPAL_WEBHOOK_SECRET", "PAYPAL_WEBHOOK_SECRET"]
      : []),
  ];
  if (missingEcoWebhookSecrets.length > 0) {
    issues.push(
      createConfigurationIssue(
        "ecoenchants-webhook-secrets",
        "EcoEnchants Webhook 验签",
        missingEcoWebhookSecrets,
        "对应支付提供方的 Webhook 会拒绝验签",
      ),
    );
  }
}
