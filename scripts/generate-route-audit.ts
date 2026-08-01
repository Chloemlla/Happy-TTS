import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  getAllRouteAuditRecords,
  renderCrossLayerComplianceReport,
  renderRouteAuditMarkdown,
  validateRouteGovernance,
} from "../src/routes";

async function main() {
  const records = getAllRouteAuditRecords();
  const violations = validateRouteGovernance();

  const outputDir = path.resolve(process.cwd(), "docs", "generated");
  await mkdir(outputDir, { recursive: true });

  // Route governance audit
  const jsonPath = path.join(outputDir, "route-audit.json");
  const markdownPath = path.join(outputDir, "route-governance.md");

  await writeFile(
    jsonPath,
    `${JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        totals: {
          routes: records.length,
          violations: violations.length,
        },
        violations,
        records,
      },
      null,
      2,
    )}\n`,
    "utf8",
  );

  await writeFile(markdownPath, renderRouteAuditMarkdown(records, violations), "utf8");

  // Cross-layer compliance report
  const crossLayerPath = path.join(outputDir, "cross-layer-compliance.md");
  await writeFile(crossLayerPath, renderCrossLayerComplianceReport(records, violations), "utf8");

  console.log(`Wrote ${jsonPath}`);
  console.log(`Wrote ${markdownPath}`);
  console.log(`Wrote ${crossLayerPath}`);

  // Cross-layer violations are non-fatal (informational) in the audit script.
  // Only structural governance violations cause exit code 1.
  const structuralViolations = violations.filter(
    (v) =>
      v.code !== "auth-middleware-not-found" &&
      v.code !== "rate-limit-not-found" &&
      v.code !== "auth-handler-unknown" &&
      v.code !== "middleware-consistency-violation",
  );

  if (structuralViolations.length) {
    console.error(`Route governance validation failed with ${structuralViolations.length} structural violation(s).`);
    process.exit(1);
  }

  if (violations.length > structuralViolations.length) {
    console.warn(`Cross-layer compliance: ${violations.length - structuralViolations.length} informational violation(s) found. See ${crossLayerPath} for details.`);
  }

  process.exit(0);
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
