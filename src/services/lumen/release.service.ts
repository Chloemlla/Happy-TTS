import crypto from "node:crypto";
import { AdminRelease, type IAdminRelease, type IAdminReleaseAsset } from "../../models/lumen/index.js";
import { ApiError } from "./errors.js";

// ── Rollout helpers ──────────────────────────────────────────────────────

function normalizeChannel(value: string): string {
  return value.trim().toLowerCase().replace(/_/g, "-") || "stable";
}

function normalizeAbi(value: string): string {
  return value.trim().toLowerCase().replace(/-/g, "_");
}

/**
 * Compute rollout bucket via hash-based bucketing.
 * Uses SipHash-like approach via DefaultHasher semantics.
 * Returns a value in [0, 100).
 */
function rolloutBucket(key: string, versionCode: number): number {
  // Port of Rust's DefaultHasher (SipHash-1-3): hash key and version_code
  // as separate typed inputs, then (finish % 10_000) / 100.
  const hash = crypto
    .createHash("md5")
    .update(`${key}\x00${versionCode}`)
    .digest("hex");
  const bucket = parseInt(hash.slice(0, 8), 16) % 10000;
  return bucket / 100;
}

function rolloutAllows(
  rollout: string | undefined,
  versionCode: number,
  rolloutKey?: string,
): boolean {
  const r = (rollout || "").trim().toLowerCase();
  if (!r || r === "all" || r === "stable" || r === "100" || r === "100%") {
    return true;
  }
  if (r === "blocked" || r === "paused" || r === "0" || r === "0%") {
    return false;
  }
  const percent = rolloutPercent(r);
  if (percent === undefined) return true; // non-numeric → always eligible
  if (percent <= 0) return false;
  if (percent >= 100) return true;
  if (!rolloutKey || rolloutKey.trim() === "") return false;
  return rolloutBucket(rolloutKey.trim(), versionCode) < percent;
}

function rolloutPercent(value: string): number | undefined {
  const cleaned = value.replace(/%$/, "");
  const parsed = parseFloat(cleaned);
  if (isNaN(parsed)) return undefined;
  return Math.max(0, Math.min(100, parsed));
}

/**
 * Select the best release asset for the requested ABI.
 * Priority: exact ABI match → universal → first asset.
 */
function selectReleaseAsset(
  assets: IAdminReleaseAsset[] | undefined,
  requestedAbi: string,
): IAdminReleaseAsset | undefined {
  if (!assets || assets.length === 0) return undefined;
  const normalizedAbi = normalizeAbi(requestedAbi);
  return (
    assets.find((a) => normalizeAbi(a.abi) === normalizedAbi) ||
    assets.find((a) => {
      const n = normalizeAbi(a.abi);
      return n === "universal" || n === "all";
    }) ||
    assets[0]
  );
}

// ── Public API ──────────────────────────────────────────────────────────

/**
 * Check for a release update.
 *
 * Finds the latest release for the specified channel, checks version,
 * computes rollout eligibility via hash-based bucketing, selects the best
 * asset for the given ABI, and returns the full release response.
 */
export async function checkRelease(options: {
  currentVersionCode?: number;
  abi?: string;
  channel?: string;
  rolloutKey?: string;
}) {
  const { currentVersionCode, abi, channel, rolloutKey } = options;
  const currentVersion = currentVersionCode || 0;
  const requestedAbi = abi || "universal";
  const requestedChannel = channel || "stable";
  const targetChannel = normalizeChannel(requestedChannel);

  // Find the latest release for this channel (with fallback to default).
  const releases = await AdminRelease.find({ channel: targetChannel })
    .sort({ versionCode: -1 })
    .lean()
    .exec();

  // If no match and requesting a non-default channel, fall back to stable.
  let release = releases[0];
  if (!release && requestedChannel !== "stable") {
    const fallback = await AdminRelease.find({ channel: "stable" })
      .sort({ versionCode: -1 })
      .lean()
      .exec();
    release = fallback[0];
  }

  if (!release) {
    return {
      updateAvailable: false,
      currentVersionCode: currentVersion,
      checkedAt: Date.now(),
      channel: requestedChannel,
      abi: requestedAbi,
    };
  }

  // Apply rollout gate.
  if (!rolloutAllows(release.rollout, release.versionCode, rolloutKey)) {
    return {
      updateAvailable: false,
      currentVersionCode: currentVersion,
      checkedAt: Date.now(),
      channel: requestedChannel,
      abi: requestedAbi,
      latestVersion: {
        versionCode: release.versionCode,
        versionName: release.versionName,
      },
    };
  }

  // If no current version or already up to date.
  if (!currentVersionCode || currentVersionCode >= release.versionCode) {
    return {
      updateAvailable: false,
      currentVersionCode: currentVersion,
      checkedAt: Date.now(),
      channel: requestedChannel,
      abi: requestedAbi,
      latestVersion: {
        versionCode: release.versionCode,
        versionName: release.versionName,
      },
    };
  }

  // Select the best asset for the requested ABI.
  const selectedAsset = selectReleaseAsset(release.assets, requestedAbi);
  const selectedAbi = selectedAsset ? normalizeAbi(selectedAsset.abi) : normalizeAbi(requestedAbi);

  return {
    updateAvailable: true,
    currentVersionCode: currentVersion,
    versionCode: release.versionCode,
    versionName: release.versionName,
    tagName: `v${release.versionName}`,
    releaseUrl: release.releaseUrl,
    sha256: release.sha256,
    fullApkUrl: selectedAsset?.url || "",
    fullApkSha256: selectedAsset?.sha256 || release.sha256,
    fullApkSizeBytes: selectedAsset?.sizeBytes || 0,
    rollout: release.rollout,
    forceUpdate: release.forceUpdate,
    createdAt: release.createdAt,
    checkedAt: Date.now(),
    channel: release.channel,
    abi: selectedAbi,
    assets: release.assets?.map((a) => ({
      abi: a.abi,
      name: a.name,
      url: a.url,
      sha256: a.sha256,
      sizeBytes: a.sizeBytes,
      contentType: a.contentType,
    })),
    patches: release.patches?.map((p) => ({
      fromVersionCode: p.fromVersionCode,
      fromSha256: p.fromSha256,
      toSha256: p.toSha256,
      patchUrl: p.patchUrl,
      patchSha256: p.patchSha256,
      algorithm: p.algorithm,
      sizeBytes: p.sizeBytes,
    })),
  };
}