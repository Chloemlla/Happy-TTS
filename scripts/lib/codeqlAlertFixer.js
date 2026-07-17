/**
 * CodeQL / code-scanning alert discovery and autofix helpers.
 * Designed for scripts/fix-dependabot-alerts.js (ESM).
 */

import { existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const CODEQL_USER_AGENT = 'synapse-codeql-alert-fixer';

/** Rules we can safely auto-remediate in-repo. */
export const AUTOFIXABLE_CODEQL_RULES = new Set([
  'js/clear-text-logging',
]);

const RATE_LIMITING_RULE = 'js/missing-rate-limiting';
const CLEAR_TEXT_LOGGING_RULE = 'js/clear-text-logging';

const SKIP_PATH_PREFIXES = [
  'src/tests/',
  'frontend/src/tests/',
  'scripts/',
  'test-data/',
  'coverage/',
  'dist/',
  'dist-obfuscated/',
  'frontend/dist/',
];

function normalizeRepoPath(repoPath) {
  const normalizedPath = `${repoPath ?? ''}`
    .trim()
    .replace(/\\/g, '/')
    .replace(/^\/+/, '')
    .replace(/^\.\//, '')
    .replace(/\/+$/, '');

  return normalizedPath === '.' ? '' : normalizedPath;
}

function shouldSkipPath(repoPath) {
  const normalized = normalizeRepoPath(repoPath).toLowerCase();
  if (!normalized) {
    return true;
  }

  if (/\.(test|spec)\.(ts|tsx|js|jsx|mts|cts)$/i.test(normalized)) {
    return true;
  }

  return SKIP_PATH_PREFIXES.some((prefix) => normalized.startsWith(prefix));
}

function parseNextLink(linkHeader) {
  if (!linkHeader) {
    return null;
  }

  for (const linkPart of linkHeader.split(',')) {
    const match = linkPart.match(/<([^>]+)>;\s*rel="next"/);
    if (!match) {
      continue;
    }

    const nextUrl = new URL(match[1]);
    return `${nextUrl.pathname}${nextUrl.search}`;
  }

  return null;
}

async function requestGitHubJson(apiRoot, apiPath, token, apiVersion) {
  const response = await fetch(`${apiRoot}${apiPath}`, {
    headers: {
      accept: 'application/vnd.github+json',
      authorization: `Bearer ${token}`,
      'user-agent': CODEQL_USER_AGENT,
      'x-github-api-version': apiVersion,
    },
  });
  const responseText = await response.text();
  const payload = responseText ? JSON.parse(responseText) : null;

  if (!response.ok) {
    throw new Error(
      `GitHub API GET ${apiPath} failed: HTTP ${response.status} ${responseText || '<empty>'}`
    );
  }

  return {
    payload,
    nextPath: parseNextLink(response.headers.get('link')),
  };
}

export function getCodeScanningAlertRuleId(alert) {
  return `${alert?.rule?.id ?? alert?.rule?.name ?? ''}`.trim();
}

export function getCodeScanningAlertPath(alert) {
  return normalizeRepoPath(
    alert?.most_recent_instance?.location?.path
    ?? alert?.most_recent_instance?.location?.file
    ?? ''
  );
}

export function getCodeScanningAlertMessage(alert) {
  return `${alert?.most_recent_instance?.message?.text ?? alert?.rule?.description ?? ''}`.trim();
}

export function getCodeScanningAlertSeverity(alert) {
  return `${
    alert?.rule?.security_severity_level
    ?? alert?.rule?.severity
    ?? 'unknown'
  }`.trim().toLowerCase();
}

export function formatCodeScanningAlert(alert) {
  const alertNumber = alert?.number ? `#${alert.number}` : '#?';
  const ruleId = getCodeScanningAlertRuleId(alert) || '<unknown-rule>';
  const severity = getCodeScanningAlertSeverity(alert);
  const filePath = getCodeScanningAlertPath(alert) || '<unknown-path>';
  return `${alertNumber} ${ruleId} [${severity}] ${filePath}`;
}

export function isAutofixableCodeScanningAlert(alert) {
  const ruleId = getCodeScanningAlertRuleId(alert);
  if (!AUTOFIXABLE_CODEQL_RULES.has(ruleId)) {
    return false;
  }

  const filePath = getCodeScanningAlertPath(alert);
  if (shouldSkipPath(filePath)) {
    return false;
  }

  // Only touch production source for route/security style fixes.
  if (ruleId === RATE_LIMITING_RULE) {
    return /^(src|frontend\/src)\//.test(filePath)
      && /\.(ts|tsx|js|jsx|mts|cts)$/.test(filePath);
  }

  if (ruleId === CLEAR_TEXT_LOGGING_RULE) {
    return /^(src|frontend\/src|scripts)\//.test(filePath)
      && /\.(ts|tsx|js|jsx|mts|cts)$/.test(filePath);
  }

  return false;
}

export async function fetchOpenCodeScanningAlerts(repository, token, {
  apiRoot = 'https://api.github.com',
  apiVersion = '2022-11-28',
} = {}) {
  const [owner, repo] = repository.split('/');
  const alerts = [];
  let nextPath =
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/code-scanning/alerts?state=open&per_page=100&tool_name=CodeQL`;

  while (nextPath) {
    const { payload, nextPath: followingPath } = await requestGitHubJson(
      apiRoot,
      nextPath,
      token,
      apiVersion
    );
    alerts.push(...(Array.isArray(payload) ? payload : []));
    nextPath = followingPath;
  }

  return alerts;
}

export function createCodeScanningAlertPlan(alerts) {
  const autofixable = [];
  const unsupported = [];
  const skipped = [];

  for (const alert of alerts) {
    const ruleId = getCodeScanningAlertRuleId(alert);
    const filePath = getCodeScanningAlertPath(alert);

    // Rate-limiting findings are intentionally not autofixed: limiters are often
    // configured via shared middleware/global routers and produce frequent false positives.
    if (ruleId === RATE_LIMITING_RULE) {
      skipped.push(alert);
      continue;
    }

    if (!AUTOFIXABLE_CODEQL_RULES.has(ruleId)) {
      unsupported.push(alert);
      continue;
    }

    if (shouldSkipPath(filePath) || !isAutofixableCodeScanningAlert(alert)) {
      skipped.push(alert);
      continue;
    }

    autofixable.push(alert);
  }

  return {
    alerts,
    autofixable,
    unsupported,
    skipped,
  };
}

export function printCodeScanningAlertDiscovery(repository, plan) {
  console.log(
    `CodeQL alert discovery: ${plan.alerts.length} open CodeQL alert(s) from ${repository}.`
  );
  console.log(`Autofixable CodeQL alerts: ${plan.autofixable.length}`);
  console.log(`Skipped (tests/non-source/path policy): ${plan.skipped.length}`);
  console.log(`Unsupported rules: ${plan.unsupported.length}`);

  for (const alert of plan.autofixable.slice(0, 20)) {
    console.log(`  - ${formatCodeScanningAlert(alert)}`);
  }

  if (plan.autofixable.length > 20) {
    console.log(`  - ... ${plan.autofixable.length - 20} more autofixable`);
  }

  if (plan.unsupported.length > 0) {
    const ruleCounts = new Map();
    for (const alert of plan.unsupported) {
      const ruleId = getCodeScanningAlertRuleId(alert) || '<unknown>';
      ruleCounts.set(ruleId, (ruleCounts.get(ruleId) || 0) + 1);
    }

    const ranked = Array.from(ruleCounts.entries())
      .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
      .slice(0, 10);

    console.log('  Unsupported rule breakdown:');
    for (const [ruleId, count] of ranked) {
      console.log(`  - ${ruleId}: ${count}`);
    }
  }
}

function detectIndent(line) {
  const match = `${line}`.match(/^(\s*)/);
  return match?.[1] ?? '';
}

function ensureImportLine(source, importStatement, afterImportPreference = null) {
  if (source.includes(importStatement)) {
    return { source, changed: false };
  }

  // Avoid duplicate symbol import if already imported under another form.
  if (importStatement.includes('createLimiter') && /createLimiter\s*[,}]/.test(source)) {
    return { source, changed: false };
  }

  const lines = source.split(/\r?\n/);
  let lastImportIndex = -1;

  for (let index = 0; index < lines.length; index += 1) {
    if (/^\s*import\s.+from\s+['"].+['"]\s*;?\s*$/.test(lines[index])) {
      lastImportIndex = index;
    }
  }

  let insertAt = lastImportIndex >= 0 ? lastImportIndex + 1 : 0;

  if (afterImportPreference) {
    const preferredIndex = lines.findIndex((line) => line.includes(afterImportPreference));
    if (preferredIndex >= 0) {
      insertAt = preferredIndex + 1;
    }
  }

  lines.splice(insertAt, 0, importStatement);
  return {
    source: lines.join(source.includes('\r\n') ? '\r\n' : '\n'),
    changed: true,
  };
}

function detectCreateLimiterImport(source) {
  const match = source.match(
    /import\s*\{[^}]*\bcreateLimiter\b[^}]*\}\s*from\s*['"]([^'"]+)['"]/
  );

  if (!match) {
    return null;
  }

  return match[1];
}

function resolveCreateLimiterModule(filePath, source) {
  const existingImport = detectCreateLimiterImport(source);
  if (existingImport) {
    return {
      modulePath: existingImport,
      api: /rateLimiter(?:\.[cm]?[jt]s)?$/.test(existingImport) ? 'legacy' : 'routeLimiters',
      alreadyImported: true,
    };
  }

  const normalized = normalizeRepoPath(filePath);
  let modulePath = '../middleware/routeLimiters';

  if (normalized.startsWith('src/routes/') || normalized.startsWith('src/app/')) {
    modulePath = '../middleware/routeLimiters';
  } else if (normalized.startsWith('src/')) {
    const depth = normalized.split('/').length - 2;
    const prefix = depth > 0 ? '../'.repeat(depth) : './';
    modulePath = `${prefix}middleware/routeLimiters`;
  }

  return {
    modulePath,
    api: 'routeLimiters',
    alreadyImported: false,
  };
}

function inferLimiterConfig(filePath, messageText, api) {
  const haystack = `${filePath} ${messageText}`.toLowerCase();
  const baseName = path.posix.basename(normalizeRepoPath(filePath), path.posix.extname(normalizeRepoPath(filePath)))
    .replace(/[^A-Za-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '') || 'route';

  if (api === 'legacy') {
    if (/(login|register|auth|password|totp|passkey|oauth)/.test(haystack)) {
      return {
        varName: 'codeqlAuthLimiter',
        options: {
          windowMs: 15 * 60 * 1000,
          max: 30,
          routeName: `${baseName}.auth`,
          message: '请求过于频繁，请稍后再试',
        },
      };
    }

    if (/(admin|health\/details|diagnostics)/.test(haystack)) {
      return {
        varName: 'codeqlAdminLimiter',
        options: {
          windowMs: 60 * 1000,
          max: 50,
          routeName: `${baseName}.admin`,
          message: '管理员操作过于频繁，请稍后再试',
        },
      };
    }

    return {
      varName: 'codeqlRouteLimiter',
      options: {
        windowMs: 60 * 1000,
        max: 60,
        routeName: `${baseName}.route`,
        message: '请求过于频繁，请稍后再试',
      },
    };
  }

  if (/(login|register|auth|password|totp|passkey|oauth)/.test(haystack)) {
    return {
      varName: 'codeqlAuthLimiter',
      options: {
        name: 'codeqlAuthLimiter',
        profile: 'auth',
        category: 'auth',
        message: '请求过于频繁，请稍后再试',
      },
    };
  }

  if (/(admin|health\/details|diagnostics)/.test(haystack)) {
    return {
      varName: 'codeqlAdminLimiter',
      options: {
        name: 'codeqlAdminLimiter',
        profile: 'admin',
        category: 'admin',
        message: '管理员操作过于频繁，请稍后再试',
      },
    };
  }

  if (/(ticket)/.test(haystack)) {
    return {
      varName: 'codeqlTicketLimiter',
      options: {
        name: 'codeqlTicketLimiter',
        profile: 'ticketWrite',
        category: 'ticket',
        message: '请求过于频繁，请稍后再试',
      },
    };
  }

  if (/(tts|audio)/.test(haystack)) {
    return {
      varName: 'codeqlTtsLimiter',
      options: {
        name: 'codeqlTtsLimiter',
        profile: 'ttsGenerate',
        category: 'tts',
        message: '请求过于频繁，请稍后再试',
      },
    };
  }

  return {
    varName: 'codeqlRouteLimiter',
    options: {
      name: 'codeqlRouteLimiter',
      profile: 'standard',
      category: 'public-api',
      message: '请求过于频繁，请稍后再试',
    },
  };
}

function formatLimiterDeclaration(varName, options, api, newline) {
  if (api === 'legacy') {
    return [
      `const ${varName} = createLimiter({`,
      `  windowMs: ${options.windowMs},`,
      `  max: ${options.max},`,
      `  routeName: "${options.routeName}",`,
      `  message: "${options.message}",`,
      '});',
    ].join(newline);
  }

  return [
    `const ${varName} = createLimiter({`,
    `  name: "${options.name}",`,
    `  profile: "${options.profile}",`,
    `  category: "${options.category}",`,
    `  message: "${options.message}",`,
    '});',
  ].join(newline);
}

function findReusableLimiterName(source) {
  const names = [];
  const pattern = /\bconst\s+([A-Za-z_][A-Za-z0-9_]*(?:Limiter|limiter))\s*=/g;
  let match = pattern.exec(source);

  while (match) {
    names.push(match[1]);
    match = pattern.exec(source);
  }

  // Prefer non-codeql generated limiters first, then any available limiter.
  const preferred = names.find((name) => !/^codeql/i.test(name));
  return preferred || names[0] || null;
}

function routeLineAlreadyRateLimited(line) {
  return /\b\w*Limiter\b/.test(line)
    || /\brateLimit\b/.test(line)
    || /\bcreateLimiter\b/.test(line)
    || /\bexpress-rate-limit\b/.test(line);
}

function injectLimiterOnRouteLine(line, limiterName) {
  // router.METHOD(path, ...handlers)
  const routeCallMatch = line.match(
    /^(\s*)((?:[\w$.]+)\.(?:get|post|put|patch|delete|all|use))\(\s*(.*)$/
  );

  if (!routeCallMatch) {
    return null;
  }

  const indent = routeCallMatch[1] ?? '';
  const callExpr = routeCallMatch[2];
  const remainder = routeCallMatch[3] ?? '';

  // Already includes a limiter symbol on this line.
  if (/\b\w*Limiter\b/.test(remainder) || /\brateLimit\b/.test(remainder) || /\bcreateLimiter\b/.test(remainder)) {
    return line;
  }

  // router.use(middleware...) without path
  if (callExpr.endsWith('.use')) {
    // If first arg is string path, insert after path literal.
    const withPath = remainder.match(
      /^((['"`]).*?\2)\s*,\s*(.*)$/
    );
    if (withPath) {
      return `${indent}${callExpr}(${withPath[1]}, ${limiterName}, ${withPath[3]}`;
    }

    return `${indent}${callExpr}(${limiterName}, ${remainder}`;
  }

  // Method routes: first arg should be path (string/template literal only; avoid ReDoS-prone regex-literal parsing).
  const withPath = remainder.match(
    /^((['"`])(?:\\.|(?!\2).)*\2)\s*,\s*(.*)$/
  );

  if (withPath) {
    return `${indent}${callExpr}(${withPath[1]}, ${limiterName}, ${withPath[3]}`;
  }

  // Fallback: insert limiter as first middleware-like arg after any first arg token.
  const simple = remainder.match(/^([^,]+)\s*,\s*(.*)$/);
  if (simple) {
    return `${indent}${callExpr}(${simple[1]}, ${limiterName}, ${simple[2]}`;
  }

  return null;
}

function applyMissingRateLimitingFix(source, filePath, alertsForFile) {
  const newline = source.includes('\r\n') ? '\r\n' : '\n';
  let nextSource = source;
  let changed = false;
  const notes = [];

  const sampleMessage = alertsForFile
    .map((alert) => getCodeScanningAlertMessage(alert))
    .join(' ');
  const limiterModule = resolveCreateLimiterModule(filePath, nextSource);
  const limiterConfig = inferLimiterConfig(filePath, sampleMessage, limiterModule.api);

  // Prefer reusing an existing limiter in this file to avoid API mismatch.
  const reusableLimiter = findReusableLimiterName(nextSource);
  const limiterName = reusableLimiter || limiterConfig.varName;
  if (reusableLimiter) {
    notes.push(`reused existing limiter ${limiterName}`);
  }

  // Patch route lines first so CodeQL line numbers stay valid.
  let lines = nextSource.split(/\r?\n/);
  const targetLineIndexes = new Set();

  for (const alert of alertsForFile) {
    const startLine = Number(alert?.most_recent_instance?.location?.start_line);
    if (Number.isFinite(startLine) && startLine >= 1 && startLine <= lines.length) {
      targetLineIndexes.add(startLine - 1);
    }
  }

  if (targetLineIndexes.size === 0) {
    for (let index = 0; index < lines.length; index += 1) {
      if (/\.(?:get|post|put|patch|delete|all|use)\s*\(/.test(lines[index])) {
        targetLineIndexes.add(index);
      }
    }
  }

  let routePatched = false;
  for (const lineIndex of targetLineIndexes) {
    const original = lines[lineIndex];
    if (!original || routeLineAlreadyRateLimited(original)) {
      continue;
    }

    const patched = injectLimiterOnRouteLine(original, limiterName);
    if (patched && patched !== original) {
      lines[lineIndex] = patched;
      routePatched = true;
      notes.push(`patched line ${lineIndex + 1}`);
    }
  }

  if (routePatched) {
    nextSource = lines.join(newline);
    changed = true;
  }

  // Only introduce imports/declarations when we actually patched a route and no reusable limiter exists.
  if (routePatched && !reusableLimiter) {
    if (!limiterModule.alreadyImported) {
      const importStatement = `import { createLimiter } from "${limiterModule.modulePath}";`;
      const importResult = ensureImportLine(nextSource, importStatement);
      nextSource = importResult.source;
      changed = changed || importResult.changed;
    }

    if (!new RegExp(`\\bconst\\s+${limiterName}\\b`).test(nextSource)) {
      lines = nextSource.split(/\r?\n/);
      let insertAt = 0;
      let lastImport = -1;
      for (let index = 0; index < lines.length; index += 1) {
        if (/^\s*import\s.+from\s+['"].+['"]\s*;?\s*$/.test(lines[index])) {
          lastImport = index;
        }
      }
      insertAt = lastImport >= 0 ? lastImport + 1 : 0;

      const routerIndex = lines.findIndex((line) =>
        /\b(?:const|let|var)\s+\w*[Rr]outer\w*\s*=/.test(line)
      );
      if (routerIndex >= 0) {
        insertAt = routerIndex + 1;
      }

      const declaration = formatLimiterDeclaration(
        limiterName,
        limiterConfig.options,
        limiterModule.api,
        newline
      );
      lines.splice(insertAt, 0, '', ...declaration.split(newline), '');
      nextSource = lines.join(newline);
      changed = true;
      notes.push(`added ${limiterName} via ${limiterModule.api} API`);
    }
  }

  return {
    source: nextSource,
    changed,
    notes,
  };
}
function applyClearTextLoggingFix(source, alertsForFile) {
  const newline = source.includes('\r\n') ? '\r\n' : '\n';
  const lines = source.split(/\r?\n/);
  let changed = false;
  const notes = [];

  const lineIndexes = new Set();
  for (const alert of alertsForFile) {
    const startLine = Number(alert?.most_recent_instance?.location?.start_line);
    const endLine = Number(alert?.most_recent_instance?.location?.end_line ?? startLine);

    if (Number.isFinite(startLine) && startLine >= 1) {
      const from = Math.max(0, startLine - 1);
      const to = Number.isFinite(endLine) ? Math.min(lines.length - 1, endLine - 1) : from;
      for (let index = from; index <= to; index += 1) {
        lineIndexes.add(index);
      }
    }
  }

  if (lineIndexes.size === 0) {
    for (let index = 0; index < lines.length; index += 1) {
      if (/console\.(log|info|warn|error|debug)|logger\.(log|info|warn|error|debug)/.test(lines[index])
        && SENSITIVE_KEY_PATTERN.test(lines[index])) {
        lineIndexes.add(index);
      }
    }
  }

  for (const lineIndex of lineIndexes) {
    const original = lines[lineIndex];
    const patched = sanitizeClearTextLoggingLine(original);
    if (patched && patched !== original) {
      lines[lineIndex] = patched;
      changed = true;
      notes.push(`sanitized log line ${lineIndex + 1}`);
    }
  }

  return {
    source: lines.join(newline),
    changed,
    notes,
  };
}

async function applyFixesForFile(rootDir, filePath, alertsForFile) {
  const absolutePath = path.join(rootDir, filePath);
  if (!existsSync(absolutePath)) {
    return {
      filePath,
      changed: false,
      reason: 'file-missing',
      notes: [],
    };
  }

  const originalSource = await readFile(absolutePath, 'utf8');
  let nextSource = originalSource;
  const notes = [];
  let changed = false;

  const byRule = new Map();
  for (const alert of alertsForFile) {
    const ruleId = getCodeScanningAlertRuleId(alert);
    if (!byRule.has(ruleId)) {
      byRule.set(ruleId, []);
    }
    byRule.get(ruleId).push(alert);
  }

  if (byRule.has(RATE_LIMITING_RULE)) {
    const result = applyMissingRateLimitingFix(
      nextSource,
      filePath,
      byRule.get(RATE_LIMITING_RULE)
    );
    nextSource = result.source;
    changed = changed || result.changed;
    notes.push(...result.notes.map((note) => `${RATE_LIMITING_RULE}: ${note}`));
  }

  if (byRule.has(CLEAR_TEXT_LOGGING_RULE)) {
    const result = applyClearTextLoggingFix(
      nextSource,
      byRule.get(CLEAR_TEXT_LOGGING_RULE)
    );
    nextSource = result.source;
    changed = changed || result.changed;
    notes.push(...result.notes.map((note) => `${CLEAR_TEXT_LOGGING_RULE}: ${note}`));
  }

  if (changed && nextSource !== originalSource) {
    await writeFile(absolutePath, nextSource, 'utf8');
  }

  return {
    filePath,
    changed: changed && nextSource !== originalSource,
    reason: changed ? 'patched' : 'no-op',
    notes,
    alertCount: alertsForFile.length,
  };
}

export async function runCodeScanningAutofix(rootDir, plan) {
  if (!plan || !Array.isArray(plan.autofixable) || plan.autofixable.length === 0) {
    console.log('CodeQL autofix: no autofixable open alerts.');
    return {
      filesChanged: 0,
      alertsConsidered: 0,
      results: [],
    };
  }

  const alertsByFile = new Map();
  for (const alert of plan.autofixable) {
    const filePath = getCodeScanningAlertPath(alert);
    if (!filePath) {
      continue;
    }

    if (!alertsByFile.has(filePath)) {
      alertsByFile.set(filePath, []);
    }
    alertsByFile.get(filePath).push(alert);
  }

  console.log(
    `CodeQL autofix: processing ${alertsByFile.size} file(s) covering ${plan.autofixable.length} alert(s).`
  );

  const results = [];
  for (const [filePath, alertsForFile] of alertsByFile.entries()) {
    const result = await applyFixesForFile(rootDir, filePath, alertsForFile);
    results.push(result);

    if (result.changed) {
      console.log(`[ok] ${filePath}: applied CodeQL autofix (${result.alertCount} alert(s))`);
      result.notes.slice(0, 8).forEach((note) => console.log(`  - ${note}`));
    } else {
      console.log(`[skip] ${filePath}: ${result.reason}${result.notes.length ? ` (${result.notes.join('; ')})` : ''}`);
    }
  }

  const filesChanged = results.filter((result) => result.changed).length;
  console.log(`CodeQL autofix complete: ${filesChanged}/${results.length} file(s) changed.`);

  return {
    filesChanged,
    alertsConsidered: plan.autofixable.length,
    results,
  };
}

export async function discoverCodeScanningAlertPlan({
  repository,
  token,
  apiRoot = 'https://api.github.com',
  apiVersion = '2022-11-28',
}) {
  if (!repository || !token) {
    return null;
  }

  const alerts = await fetchOpenCodeScanningAlerts(repository, token, {
    apiRoot,
    apiVersion,
  });
  const plan = createCodeScanningAlertPlan(alerts);
  printCodeScanningAlertDiscovery(repository, plan);
  return plan;
}
