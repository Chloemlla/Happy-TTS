export type ClientIntegrityOutcome = "detected" | "not-detected" | "check-failed";

export interface ClientIntegrityCheckResult {
  outcome: ClientIntegrityOutcome;
  detected: boolean;
  trust: "low";
  authorizationBoundary: false;
  reasons: string[];
  failedProbes: string[];
}

export interface ClientIntegrityDiagnostic {
  source: string;
  outcome: ClientIntegrityOutcome;
  trust: "low";
  authorizationBoundary: false;
  reasonCount: number;
  failedProbes: string[];
  timestamp: number;
}

const DIAGNOSTIC_THROTTLE_MS = 60_000;
const MAX_DIAGNOSTICS = 20;
const diagnostics: ClientIntegrityDiagnostic[] = [];
const lastDiagnosticAt = new Map<string, number>();

const ALLOWED_DIAGNOSTIC_SOURCES = new Set([
  "dangerous-extension",
  "integrity-checker",
]);

function sanitizeLabel(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9._-]/g, "-").slice(0, 64) || "unknown";
}

function sanitizeSource(value: string): string {
  const source = sanitizeLabel(value);
  return ALLOWED_DIAGNOSTIC_SOURCES.has(source) ? source : "unknown";
}

function recordDiagnostic(result: ClientIntegrityCheckResult, source: string): void {
  const safeSource = sanitizeSource(source);
  const key = `${safeSource}:${result.outcome}`;
  const now = Date.now();
  const previous = lastDiagnosticAt.get(key);

  if (previous !== undefined && now - previous < DIAGNOSTIC_THROTTLE_MS) return;
  lastDiagnosticAt.set(key, now);

  const diagnostic: ClientIntegrityDiagnostic = {
    source: safeSource,
    outcome: result.outcome,
    trust: "low",
    authorizationBoundary: false,
    reasonCount: Math.min(result.reasons.length, 100),
    failedProbes: result.failedProbes.map(sanitizeLabel).slice(0, 10),
    timestamp: now,
  };

  diagnostics.push(diagnostic);
  if (diagnostics.length > MAX_DIAGNOSTICS) diagnostics.shift();

  // This browser-only event is intentionally low-trust diagnostic telemetry. It contains
  // no exception message, stack, URL, DOM content, user identifier, or authorization data.
  // Consumers must never use it to grant or deny access.
  try {
    window.dispatchEvent(
      new CustomEvent<ClientIntegrityDiagnostic>("synapse:integrity-diagnostic", {
        detail: diagnostic,
      })
    );
  } catch {
    // The bounded in-memory snapshot remains available when event dispatch is unavailable.
  }
}

export interface ClientIntegrityCheckContext {
  probe<T>(name: string, operation: () => T): T | undefined;
  fail(name: string): void;
  finish(detected: boolean, reasons?: string[]): ClientIntegrityCheckResult;
}

export function createClientIntegrityCheck(source: string): ClientIntegrityCheckContext {
  const failedProbes = new Set<string>();

  return {
    probe<T>(name: string, operation: () => T): T | undefined {
      try {
        return operation();
      } catch {
        failedProbes.add(sanitizeLabel(name));
        return undefined;
      }
    },
    fail(name: string): void {
      failedProbes.add(sanitizeLabel(name));
    },
    finish(detected: boolean, reasons: string[] = []): ClientIntegrityCheckResult {
      const failures = Array.from(failedProbes);
      const outcome: ClientIntegrityOutcome = detected
        ? "detected"
        : failures.length > 0
          ? "check-failed"
          : "not-detected";
      const result: ClientIntegrityCheckResult = {
        outcome,
        detected,
        trust: "low",
        authorizationBoundary: false,
        reasons: reasons.slice(0, 50),
        failedProbes: failures,
      };
      recordDiagnostic(result, source);
      return result;
    },
  };
}

export function createFailedClientIntegrityCheck(
  source: string,
  probe = "unhandled-check"
): ClientIntegrityCheckResult {
  const check = createClientIntegrityCheck(source);
  check.probe(probe, () => {
    throw new Error("integrity check failed");
  });
  return check.finish(false);
}

export function getClientIntegrityDiagnostics(): readonly ClientIntegrityDiagnostic[] {
  return diagnostics.map((diagnostic) => ({
    ...diagnostic,
    failedProbes: [...diagnostic.failedProbes],
  }));
}

export function resetClientIntegrityDiagnosticsForTests(): void {
  diagnostics.length = 0;
  lastDiagnosticAt.clear();
}
