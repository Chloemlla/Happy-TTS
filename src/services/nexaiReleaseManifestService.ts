import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import logger from "../utils/logger";

export interface NexaiReleaseAsset {
  name: string;
  abi?: string;
  size: number;
  sha256: string;
  downloadUrl?: string;
}

export interface NexaiReleaseManifest {
  tag: string;
  versionName: string;
  publishedAt: string;
  assets: NexaiReleaseAsset[];
  signature?: string;
}

interface RawReleaseAsset {
  name?: unknown;
  abi?: unknown;
  size?: unknown;
  sha256?: unknown;
  downloadUrl?: unknown;
  filePath?: unknown;
}

function httpError(message: string, statusCode = 400, code = "NEXAI_RELEASE_MANIFEST_INVALID"): Error {
  return Object.assign(new Error(message), { statusCode, code });
}

function validateTag(tag: string): string {
  const normalized = String(tag || "").trim();
  if (!/^[A-Za-z0-9._-]{1,128}$/.test(normalized)) {
    throw httpError("Invalid release tag");
  }
  return normalized;
}

function getManifestDir(): string {
  return path.resolve(process.env.NEXAI_RELEASE_MANIFEST_DIR || path.join(process.cwd(), "data", "nexai-release-manifests"));
}

function getApkDir(): string {
  return path.resolve(process.env.NEXAI_RELEASE_APK_DIR || path.join(process.cwd(), "data", "nexai-release-apks"));
}

function resolveInside(baseDir: string, targetPath: string): string {
  const base = path.resolve(baseDir);
  const resolved = path.resolve(base, targetPath);
  const relative = path.relative(base, resolved);

  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw httpError("Release manifest file path escapes manifest directory");
  }

  return resolved;
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function sha256File(filePath: string): Promise<string> {
  const data = await fs.readFile(filePath);
  return crypto.createHash("sha256").update(data).digest("hex");
}

function inferAbi(name: string): string | undefined {
  return name.match(/arm64-v8a|armeabi-v7a|x86_64|x86/i)?.[0];
}

function normalizeSha256(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const normalized = value.trim().toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(normalized)) {
    throw httpError("Release manifest asset sha256 must be a 64-character lowercase hex string");
  }
  return normalized;
}

function getDownloadUrl(name: string, rawValue?: unknown): string | undefined {
  if (typeof rawValue === "string" && rawValue.trim()) {
    return rawValue.trim();
  }

  const baseUrl = process.env.NEXAI_RELEASE_DOWNLOAD_BASE_URL;
  if (!baseUrl) {
    return undefined;
  }

  return `${baseUrl.replace(/\/+$/, "")}/${encodeURIComponent(name)}`;
}

async function normalizeAsset(asset: RawReleaseAsset, manifestDir: string): Promise<NexaiReleaseAsset> {
  if (typeof asset.name !== "string" || !asset.name.trim()) {
    throw httpError("Release manifest asset name is required");
  }

  const name = asset.name.trim();
  const filePath = typeof asset.filePath === "string" && asset.filePath.trim() ? resolveInside(manifestDir, asset.filePath.trim()) : undefined;
  const stat = filePath ? await fs.stat(filePath) : undefined;
  const sha256 = normalizeSha256(asset.sha256) || (filePath ? await sha256File(filePath) : undefined);

  if (!sha256) {
    throw httpError(`Release manifest asset ${name} is missing sha256`);
  }

  const size = typeof asset.size === "number" && Number.isFinite(asset.size) ? asset.size : stat?.size;
  if (!size || size < 0) {
    throw httpError(`Release manifest asset ${name} is missing size`);
  }

  return {
    name,
    abi: typeof asset.abi === "string" && asset.abi.trim() ? asset.abi.trim() : inferAbi(name),
    size,
    sha256,
    downloadUrl: getDownloadUrl(name, asset.downloadUrl),
  };
}

async function readJsonManifest(tag: string): Promise<NexaiReleaseManifest | null> {
  const manifestDir = getManifestDir();
  const candidates = [
    path.join(manifestDir, `${tag}.json`),
    path.join(manifestDir, tag, "manifest.json"),
  ];

  for (const candidate of candidates) {
    if (!(await fileExists(candidate))) {
      continue;
    }

    const raw = JSON.parse(await fs.readFile(candidate, "utf8")) as Record<string, unknown>;
    const rawAssets = Array.isArray(raw.assets) ? (raw.assets as RawReleaseAsset[]) : [];
    const assetBaseDir = path.dirname(candidate);
    const assets = await Promise.all(rawAssets.map((asset) => normalizeAsset(asset, assetBaseDir)));

    if (assets.length === 0) {
      throw httpError("Release manifest must contain at least one asset");
    }

    return {
      tag: typeof raw.tag === "string" && raw.tag.trim() ? raw.tag.trim() : tag,
      versionName:
        typeof raw.versionName === "string" && raw.versionName.trim() ? raw.versionName.trim() : tag.replace(/^v/i, ""),
      publishedAt:
        typeof raw.publishedAt === "string" && raw.publishedAt.trim() ? raw.publishedAt.trim() : new Date().toISOString(),
      assets,
      ...(typeof raw.signature === "string" && raw.signature.trim() ? { signature: raw.signature.trim() } : {}),
    };
  }

  return null;
}

async function buildManifestFromApkDirectory(tag: string): Promise<NexaiReleaseManifest | null> {
  const releaseDir = path.join(getApkDir(), tag);
  if (!(await fileExists(releaseDir))) {
    return null;
  }

  const entries = await fs.readdir(releaseDir, { withFileTypes: true });
  const apkEntries = entries.filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".apk"));
  if (apkEntries.length === 0) {
    return null;
  }

  const dirStat = await fs.stat(releaseDir);
  const assets = await Promise.all(
    apkEntries.map(async (entry) => {
      const filePath = path.join(releaseDir, entry.name);
      const stat = await fs.stat(filePath);
      return {
        name: entry.name,
        abi: inferAbi(entry.name),
        size: stat.size,
        sha256: await sha256File(filePath),
        downloadUrl: getDownloadUrl(entry.name),
      };
    }),
  );

  return {
    tag,
    versionName: tag.replace(/^v/i, ""),
    publishedAt: dirStat.mtime.toISOString(),
    assets,
  };
}

export class NexaiReleaseManifestService {
  static async getManifest(tagParam: string): Promise<NexaiReleaseManifest | null> {
    const tag = validateTag(tagParam);

    try {
      const jsonManifest = await readJsonManifest(tag);
      if (jsonManifest) {
        return jsonManifest;
      }

      return await buildManifestFromApkDirectory(tag);
    } catch (error) {
      logger.error("[NexAI Release] manifest resolution failed", {
        tag,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }
}
