import { config, runtimeMutableConfig, startupConfig } from "../config/config";
import {
  appendMissingEnvironmentIssue,
  createConfigurationIssue,
  type MissingConfigurationIssue,
} from "./configurationNoticeIssueTypes";

export function appendCoreConfigurationIssues(issues: MissingConfigurationIssue[]): void {
  if (!runtimeMutableConfig.tts.generationCode) {
    issues.push(
      createConfigurationIssue(
        "tts-generation-code",
        "TTS 生成码",
        ["GENERATION_CODE"],
        "浏览器与会话 TTS 生成请求会返回生成码无效，API Key 调用不受影响",
      ),
    );
  }

  if (!startupConfig.configuredSecrets.openaiApiKey) {
    issues.push(
      createConfigurationIssue(
        "openai-tts",
        "OpenAI TTS",
        ["OPENAI_API_KEY", "OPENAI_KEY"],
        "OpenAI 语音生成请求会返回提供方未配置",
      ),
    );
  }

  if (!startupConfig.configuredSecrets.jwtSecret) {
    issues.push(
      createConfigurationIssue(
        "jwt-secret",
        "会话签名",
        ["JWT_SECRET"],
        "当前进程使用临时高熵密钥，重启后现有会话会失效",
      ),
    );
  }

  if (!startupConfig.configuredSecrets.signSecretKey) {
    issues.push(
      createConfigurationIssue(
        "request-signing",
        "请求签名",
        ["SIGN_SECRET_KEY"],
        "没有会话凭据的签名请求会返回服务未配置",
      ),
    );
  }

  if ((process.env.SMART_HUMAN_CHECK_SECRET || "").trim().length < 16) {
    issues.push(
      createConfigurationIssue(
        "smart-human-check-secret",
        "智能人机校验签名",
        ["SMART_HUMAN_CHECK_SECRET"],
        "当前使用进程级临时高熵密钥，重启后未完成的校验会失效",
      ),
    );
  }

  if (!startupConfig.configuredSecrets.adminPassword) {
    issues.push(
      createConfigurationIssue(
        "admin-bootstrap",
        "默认管理员引导",
        ["ADMIN_PASSWORD"],
        "不会创建新的默认管理员账户，已有管理员账户不受影响",
      ),
    );
  }

  if (!startupConfig.configuredSecrets.adminOperationPassword) {
    issues.push(
      createConfigurationIssue(
        "admin-operation-password",
        "管理员高风险操作口令",
        ["ADMIN_OPERATION_PASSWORD", "ADMIN_PASSWORD"],
        "需要二次操作口令的管理能力保持禁用",
      ),
    );
  }

  if (!startupConfig.configuredSecrets.serverPassword) {
    issues.push(
      createConfigurationIssue(
        "server-status-password",
        "服务器状态口令",
        ["SERVER_PASSWORD"],
        "受口令保护的服务器状态查询保持禁用",
      ),
    );
  }

  if (!startupConfig.configuredSecrets.passwordEncryptionKey) {
    issues.push(
      createConfigurationIssue(
        "password-encryption-key",
        "用户密码可恢复加密主密钥",
        ["PASSWORD_ENCRYPTION_KEY", "AES_KEY", "JWT_SECRET"],
        "当前仅有进程级临时密钥，重启前应配置持久密钥",
      ),
    );
  }

  if (config.publicShortUrl.enabled && !config.publicShortUrl.password) {
    issues.push(
      createConfigurationIssue(
        "public-short-url-password",
        "公共短链创建",
        ["PUBLIC_SHORT_URL_PASSWORD"],
        "公共短链创建接口会返回服务未配置",
      ),
    );
  }

  if (!startupConfig.rustServices.externalServicesConfigured) {
    issues.push(
      createConfigurationIssue(
        "rust-internal-service-token",
        "外置 Rust 服务认证",
        ["INTERNAL_SERVICE_TOKEN"],
        "外置 Rust 能力已禁用并使用可用的 Node.js 降级路径",
      ),
    );
  }

  appendMissingEnvironmentIssue(
    issues,
    "security-secret-isolation",
    "安全令牌密钥隔离",
    [
      "POLICY_SECRET_SALT",
      "VERIFICATION_TOKEN_SECRET",
      "TTS_ASSET_ACCESS_SECRET",
      "LEGACY_API_CHOICE_SECRET",
    ],
    "相关签名当前使用固定默认值或共享会话密钥，建议配置独立密钥",
  );

  appendMissingEnvironmentIssue(
    issues,
    "data-collection-secret",
    "原始运行数据加密",
    ["DATA_COLLECTION_RAW_SECRET"],
    "原始详情加密能力保持关闭",
  );
}
