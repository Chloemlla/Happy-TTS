export interface ConfigurationNoticeIssue {
  id: string;
  label: string;
  settingNames: string[];
  impact: string;
}

export interface ConfigurationNoticeWorkflow {
  issues: ConfigurationNoticeIssue[];
  ignoredIds: string[];
}

export const CONFIGURATION_WORKFLOW_STORAGE_KEY =
  'synapse:configuration-notice-workflow:v1';

const ISSUE_SECTION_MAP: Record<string, string> = {
  'tts-generation-code': 'tts',
  'openai-tts': 'envs',
  'fish-audio-tts': 'ttsProvider',
  'jwt-secret': 'envs',
  'request-signing': 'envs',
  'smart-human-check-secret': 'envs',
  'admin-bootstrap': 'adminSecurity',
  'admin-operation-password': 'adminSecurity',
  'server-status-password': 'adminSecurity',
  'password-encryption-key': 'securitySecrets',
  'public-short-url-password': 'adminSecurity',
  'security-secret-isolation': 'securitySecrets',
  'data-collection-secret': 'securitySecrets',
  'resend-email': 'emailSystem',
  outemail: 'emailSystem',
  'linuxdo-oauth': 'linuxdo',
  'google-oauth': 'googleClientIds',
  'nexai-google-oauth': 'googleClientIds',
  'nexai-github-oauth': 'nexai',
  'nexai-request-signing': 'nexaiSigning',
  'linuxdo-credit': 'envs',
  'ip-reputation': 'ipqs',
  'ecoenchants-token-secrets': 'ecoEnchantsToken',
  'ecoenchants-webhook-secrets': 'ecoEnchantsWebhook',
  turnstile: 'turnstile',
  hcaptcha: 'hcaptcha',
  'resend-webhook': 'webhook',
  'ipfs-upload': 'ipfs',
  'librechat-provider': 'providers',
};

export function getConfigurationSectionKey(issueId: string): string {
  return ISSUE_SECTION_MAP[issueId] || 'envs';
}

export function isConfigurationNoticeIssue(value: unknown): value is ConfigurationNoticeIssue {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const issue = value as Record<string, unknown>;
  return (
    typeof issue.id === 'string' &&
    typeof issue.label === 'string' &&
    Array.isArray(issue.settingNames) &&
    issue.settingNames.every((name) => typeof name === 'string') &&
    typeof issue.impact === 'string'
  );
}

export function readConfigurationWorkflow(): ConfigurationNoticeWorkflow | null {
  try {
    const raw = window.sessionStorage.getItem(CONFIGURATION_WORKFLOW_STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    const workflow = parsed as Record<string, unknown>;
    if (!Array.isArray(workflow.issues)) return null;
    const issues = workflow.issues.filter(isConfigurationNoticeIssue);
    const ignoredIds = Array.isArray(workflow.ignoredIds)
      ? workflow.ignoredIds.filter((id): id is string => typeof id === 'string')
      : [];
    return { issues, ignoredIds };
  } catch {
    return null;
  }
}

export function writeConfigurationWorkflow(workflow: ConfigurationNoticeWorkflow | null): void {
  try {
    if (!workflow) {
      window.sessionStorage.removeItem(CONFIGURATION_WORKFLOW_STORAGE_KEY);
      return;
    }
    window.sessionStorage.setItem(CONFIGURATION_WORKFLOW_STORAGE_KEY, JSON.stringify(workflow));
  } catch {
    // Storage failures must not block configuration management.
  }
}

