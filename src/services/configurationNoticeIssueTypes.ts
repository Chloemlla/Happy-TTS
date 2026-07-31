export interface MissingConfigurationIssue {
  id: string;
  label: string;
  settingNames: string[];
  impact: string;
}

export function createConfigurationIssue(
  id: string,
  label: string,
  settingNames: string[],
  impact: string,
): MissingConfigurationIssue {
  return { id, label, settingNames, impact };
}

export function appendMissingEnvironmentIssue(
  issues: MissingConfigurationIssue[],
  id: string,
  label: string,
  names: string[],
  impact: string,
): void {
  const missing = names.filter((name) => !process.env[name]?.trim());
  if (missing.length > 0) {
    issues.push(createConfigurationIssue(id, label, missing, impact));
  }
}
