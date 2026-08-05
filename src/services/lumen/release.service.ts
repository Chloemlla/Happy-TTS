import crypto from "node:crypto";
import { AdminRelease, type IAdminRelease, type IAdminReleaseAsset } from "../../models/lumen/index.js";
import { ApiError } from "./errors.js";

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

  const targetChannel = channel || "stable";

  // Find the latest release for this channel.
  const release = await AdminRelease.findOne({ channel: targetChannel })
    .sort({ versionCode: -1 })
    .lean()
    .exec();

  if (!release) {
    return {
      updateAvailable: false,
      checkedAt: new Date().toISOString(),
      channel: targetChannel,
    };
  }

  // If no current version, always return the latest.
  if (!currentVersionCode || currentVersionCode >= release.versionCode) {
    return {
      updateAvailable: false,
      checkedAt: new Date().toISOString(),
      channel: targetChannel,
      latestVersion: {
        versionCode: release.versionCode,
        versionName: release.versionName,
      },
    };
  }

  // Compute rollout eligibility.
  let rolloutEligible = true;
  if (release.rollout && release.rollout !== "100" && rolloutKey) {
    const hash = crypto
      .createHash("md5")
      .update(`${rolloutKey}${release.versionCode}`)
      .digest("hex");
    const bucket = parseInt(hash.slice(0, 8), 16) % 10000;
    const rolloutPercent = parseFloat(release.rollout);
    rolloutEligible = bucket / 100 < rolloutPercent;
  }

  if (!rolloutEligible) {
    return {
      updateAvailable: false,
      checkedAt: new Date().toISOString(),
      channel: targetChannel,
      latestVersion: {
        versionCode: release.versionCode,
        versionName: release.versionName,
      },
    };
  }

  // Select the best asset for the requested ABI.
  let selectedAsset: IAdminReleaseAsset | undefined;
  let fullApkAsset: IAdminReleaseAsset | undefined;

  if (release.assets && release.assets.length > 0) {
    // Full APK: universal is always preferred if present.
    fullApkAsset = release.assets.find((a) => a.abi === "universal");

    // ABI-specific asset.
    if (abi) {
      selectedAsset = release.assets.find((a) => a.abi === abi);
    }

    // Fallback to universal.
    if (!selectedAsset) {
      selectedAsset = fullApkAsset || release.assets[0];
    }

    // Full APK fallback.
    if (!fullApkAsset) {
      fullApkAsset = release.assets.find((a) => a.abi === "universal") || selectedAsset;
    }
  }

  return {
    updateAvailable: true,
    versionCode: release.versionCode,
    versionName: release.versionName,
    tagName: `v${release.versionName}`,
    releaseUrl: release.releaseUrl,
    sha256: release.sha256,
    fullApkUrl: fullApkAsset?.url || selectedAsset?.url,
    fullApkSha256: fullApkAsset?.sha256 || selectedAsset?.sha256,
    fullApkSizeBytes: fullApkAsset?.sizeBytes || selectedAsset?.sizeBytes || 0,
    rollout: release.rollout,
    forceUpdate: release.forceUpdate,
    createdAt: new Date(release.createdAt).toISOString(),
    checkedAt: new Date().toISOString(),
    channel: targetChannel,
    abi: selectedAsset?.abi || abi || "universal",
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