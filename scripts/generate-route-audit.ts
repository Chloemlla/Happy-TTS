import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  getAllRouteAuditRecords,
  renderRouteAuditMarkdown,
  validateRouteGovernance,
} from "../src/routes";

async function main() {
  const records = getAllRouteAuditRecords();
  const violations = validateRouteGovernance();

  const outputDir = path.resolve(process.cwd(), "docs", "generated");
  await mkdir(outputDir, { recursive: true });

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

  console.log(`Wrote ${jsonPath}`);
  console.log(`Wrote ${markdownPath}`);

  if (violations.length) {
    console.error(`Route governance validation failed with ${violations.length} violation(s).`);
    process.exit(1);
  }

  process.exit(0);
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
