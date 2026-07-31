import {
  type OptionalCapabilityProbeSnapshot,
  probeOptionalCapabilities,
} from "./configurationCapabilityProbeService";
import { appendCoreConfigurationIssues } from "./configurationNoticeCoreIssues";
import { appendIntegrationConfigurationIssues } from "./configurationNoticeIntegrationIssues";
import {
  createConfigurationIssue,
  type MissingConfigurationIssue,
} from "./configurationNoticeIssueTypes";

export type { MissingConfigurationIssue } from "./configurationNoticeIssueTypes";

function appendProbedIssues(
  issues: MissingConfigurationIssue[],
  probes: OptionalCapabilityProbeSnapshot,
): void {
  const fishAudio = probes.ttsProviders.find((provider) => provider.name === "fish");
  if (fishAudio && !fishAudio.configured) {
    issues.push(
      createConfigurationIssue(
        "fish-audio-tts",
        "Fish Audio TTS",
        ["FISH_AUDIO_API_KEY"],
        fishAudio.active
          ? "Fish Audio 已启用，语音生成请求会返回提供方未配置"
          : "Fish Audio 提供方尚未配置，切换启用前需要设置 API Key",
      ),
    );
  }

  const missingTurnstile = [
    ...(!probes.turnstile.secretConfigured ? ["TURNSTILE_SECRET_KEY"] : []),
    ...(!probes.turnstile.siteConfigured ? ["TURNSTILE_SITE_KEY"] : []),
  ];
  if (missingTurnstile.length > 0) {
    issues.push(
      createConfigurationIssue(
        "turnstile",
        "Cloudflare Turnstile",
        missingTurnstile,
        "Turnstile 校验请求会安全失败，不会绕过验证",
      ),
    );
  }

  const missingHCaptcha = [
    ...(!probes.hcaptcha.secretConfigured ? ["HCAPTCHA_SECRET_KEY"] : []),
    ...(!probes.hcaptcha.siteConfigured ? ["HCAPTCHA_SITE_KEY"] : []),
  ];
  if (missingHCaptcha.length > 0) {
    issues.push(
      createConfigurationIssue(
        "hcaptcha",
        "hCaptcha",
        missingHCaptcha,
        "hCaptcha 校验请求会安全失败，不会绕过验证",
      ),
    );
  }

  if (!probes.resendWebhookConfigured) {
    issues.push(
      createConfigurationIssue(
        "resend-webhook",
        "Resend Webhook 验签",
        ["RESEND_WEBHOOK_SECRET", "WEBHOOK_SECRET"],
        "Resend Webhook 请求会返回未配置",
      ),
    );
  }

  if (!probes.ipfsUploadConfigured) {
    issues.push(
      createConfigurationIssue(
        "ipfs-upload",
        "IPFS 上传",
        ["IPFS_UPLOAD_URL"],
        "IPFS 上传请求会返回服务未配置",
      ),
    );
  }

  if (!probes.libreChatProviderConfigured) {
    issues.push(
      createConfigurationIssue(
        "librechat-provider",
        "LibreChat 模型提供方",
        ["CHAT_BASE_URL", "CHAT_API_KEY"],
        "聊天生成请求会返回模型提供方未配置",
      ),
    );
  }
}

export async function getMissingConfigurationIssues(): Promise<MissingConfigurationIssue[]> {
  const issues: MissingConfigurationIssue[] = [];
  appendCoreConfigurationIssues(issues);
  appendIntegrationConfigurationIssues(issues);
  appendProbedIssues(issues, await probeOptionalCapabilities());
  return issues.sort((left, right) => left.id.localeCompare(right.id));
}
