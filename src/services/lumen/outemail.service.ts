import { lumenConfig } from "../../config/lumen.js";
import logger from "../../utils/logger.js";

/**
 * Redact an email for log output: keep the first character and the domain.
 * Never log a full email address or a login code (G7-14).
 */
function maskEmail(email: string): string {
  const at = email.indexOf("@");
  if (at <= 0) return "***";
  const local = email.slice(0, at);
  const maskedLocal = local.length <= 2 ? `${local[0] || ""}**` : `${local.slice(0, 2)}***`;
  return `${maskedLocal}${email.slice(at)}`;
}

/**
 * Send a login verification code via outemail.
 *
 * If no outemail API key is configured, logs a warning and returns a
 * dev-mode sentinel so callers can return the dev login code to the client.
 */
export async function sendLoginCode(email: string, code: string): Promise<void> {
  if (!lumenConfig.outemailApiKey) {
    logger.warn("[Lumen Outemail] No outemail API key configured — login code not sent (dev mode)", {
      email: maskEmail(email),
    });
    return;
  }

  const html = loginCodeHtmlTemplate(code);

  try {
    // codeql[js/request-forgery] URL host is operator config (lumenConfig.outemailApiUrl), not request-derived; no user input reaches the request URL
    const response = await fetch(
      `${lumenConfig.outemailApiUrl}/api/outemail/send`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${lumenConfig.outemailApiKey}`,
        },
        body: JSON.stringify({
          to: email,
          subject: "Your Project Lumen login code",
          content: html,
          from: lumenConfig.outemailFrom,
          displayName: lumenConfig.outemailDisplayName,
          domain: lumenConfig.outemailDomain || undefined,
        }),
        signal: AbortSignal.timeout(lumenConfig.outemailTimeoutSeconds * 1000),
      },
    );

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      logger.error("[Lumen Outemail] Failed to send login code", {
        status: response.status,
        body,
        email: maskEmail(email),
      });
      throw new Error(`Outemail returned ${response.status}`);
    }
  } catch (error) {
    logger.error("[Lumen Outemail] Error sending login code", {
      error: error instanceof Error ? error.message : String(error),
      email: maskEmail(email),
    });
    throw error;
  }
}

/**
 * Simple HTML email template for the login code.
 */
function loginCodeHtmlTemplate(code: string): string {
  const baseUrl = lumenConfig.outemailBaseUrl;
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family:sans-serif;padding:32px;background:#f5f5f5">
  <div style="max-width:480px;margin:0 auto;background:#fff;border-radius:12px;padding:32px">
    <h2 style="margin-top:0">Project Lumen</h2>
    <p>Your login code is:</p>
    <div style="font-size:32px;font-weight:bold;letter-spacing:6px;text-align:center;padding:16px;background:#f0f0f0;border-radius:8px;font-family:monospace">${code}</div>
    <p style="color:#666;font-size:14px">This code expires in 5 minutes. If you did not request this, you can safely ignore this email.</p>
    <p style="color:#999;font-size:12px">Project Lumen &mdash; <a href="${baseUrl}" style="color:#999">${baseUrl}</a></p>
  </div>
</body>
</html>`;
}