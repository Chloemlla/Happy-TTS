import { generateProviderGeneratedPasswordEmailHtml } from "../templates/emailTemplates";
import logger from "../utils/logger";
import { sendEmail } from "./emailSender";

const INTERNAL_PLACEHOLDER_EMAIL_DOMAINS = new Set(["linuxdo.oauth.local", "google.nexai", "github.nexai"]);

function getEmailDomain(email: string): string {
  const atIndex = email.lastIndexOf("@");
  return atIndex >= 0 ? email.slice(atIndex + 1).trim().toLowerCase() : "";
}

export function canSendProviderCredentialEmail(email: string): boolean {
  const normalizedEmail = String(email || "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
    return false;
  }

  return !INTERNAL_PLACEHOLDER_EMAIL_DOMAINS.has(getEmailDomain(normalizedEmail));
}

export async function sendProviderGeneratedPasswordEmail(params: {
  email: string;
  username: string;
  password: string;
  providerLabel: string;
}): Promise<void> {
  if (!canSendProviderCredentialEmail(params.email)) {
    logger.info("[ProviderCredentialEmail] Skipped generated password email for non-deliverable provider email", {
      username: params.username,
      providerLabel: params.providerLabel,
      emailDomain: getEmailDomain(params.email),
    });
    return;
  }

  try {
    const html = generateProviderGeneratedPasswordEmailHtml(params.username, params.providerLabel, params.password);
    const result = await sendEmail({
      to: params.email,
      subject: "Synapse 账号密码凭据",
      html,
      logTag: "第三方注册密码凭据",
      checkQuota: false,
    });

    if (!result.success) {
      logger.warn("[ProviderCredentialEmail] Generated password email failed", {
        username: params.username,
        providerLabel: params.providerLabel,
        email: params.email,
        error: result.error,
      });
    }
  } catch (error) {
    logger.warn("[ProviderCredentialEmail] Generated password email threw", {
      username: params.username,
      providerLabel: params.providerLabel,
      email: params.email,
      error,
    });
  }
}
