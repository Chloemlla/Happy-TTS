import fs from "node:fs";
import path from "node:path";

interface OpenapiJsonCache {
  filePath: string;
  mtimeMs: number;
  content: string;
}

let openapiJsonCache: OpenapiJsonCache | null = null;

export function getOpenapiJsonCandidates(): string[] {
  return [
    process.env.OPENAPI_JSON_PATH && path.resolve(process.env.OPENAPI_JSON_PATH),
    "/app/openapi.json",
    path.join(process.cwd(), "openapi.json"),
    path.join(__dirname, "../openapi.json"),
    path.join(process.cwd(), "dist/openapi.json"),
  ].filter(Boolean) as string[];
}

function formatOpenapiNotFoundError(candidates: string[]): Error {
  return new Error(`openapi.json not found in: ${candidates.join(" | ")}`);
}

export function readOpenapiJsonSync(): string {
  const candidates = getOpenapiJsonCandidates();

  for (const candidate of candidates) {
    try {
      const stats = fs.statSync(candidate);
      if (!stats.isFile()) {
        continue;
      }

      if (openapiJsonCache?.filePath === candidate && openapiJsonCache.mtimeMs === stats.mtimeMs) {
        return openapiJsonCache.content;
      }

      const content = fs.readFileSync(candidate, "utf-8");
      openapiJsonCache = { filePath: candidate, mtimeMs: stats.mtimeMs, content };
      return content;
    } catch (_error) {
      // Try the next candidate path.
    }
  }

  throw formatOpenapiNotFoundError(candidates);
}

export async function readOpenapiJson(): Promise<string> {
  const candidates = getOpenapiJsonCandidates();

  for (const candidate of candidates) {
    try {
      const stats = await fs.promises.stat(candidate);
      if (!stats.isFile()) {
        continue;
      }

      if (openapiJsonCache?.filePath === candidate && openapiJsonCache.mtimeMs === stats.mtimeMs) {
        return openapiJsonCache.content;
      }

      const content = await fs.promises.readFile(candidate, "utf-8");
      openapiJsonCache = { filePath: candidate, mtimeMs: stats.mtimeMs, content };
      return content;
    } catch (_error) {
      // Try the next candidate path.
    }
  }

  throw formatOpenapiNotFoundError(candidates);
}

export function shouldServeSwaggerFromJsonUrl(): boolean {
  if (process.env.OPENAPI_JSON_PATH) {
    return true;
  }

  try {
    return fs.statSync("/app/openapi.json").isFile();
  } catch (_error) {
    return false;
  }
}

