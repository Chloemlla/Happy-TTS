import * as sodium from "libsodium-wrappers";

export interface GithubTarget {
  owner: string;
  repo: string;
  token: string;
  configured: boolean;
}

export function getGithubTarget(): GithubTarget {
  const owner = process.env.PROJECT_LUMEN_GITHUB_OWNER || "";
  const repo = process.env.PROJECT_LUMEN_GITHUB_REPO || "";
  const token = process.env.PROJECT_LUMEN_GITHUB_TOKEN || "";
  const configured = Boolean(owner && repo && token);
  return { owner, repo, token, configured };
}

/**
 * Encrypt a value using libsodium sealed box for GitHub Actions secrets.
 * @param value - The plaintext value to encrypt.
 * @param publicKeyBase64 - The base64-encoded libsodium public key from GitHub.
 * @returns The base64-encoded ciphertext.
 */
export async function encryptRepoSecret(value: string, publicKeyBase64: string): Promise<string> {
  await sodium.ready;
  const publicKey = Buffer.from(publicKeyBase64, "base64");
  const message = Buffer.from(value, "utf8");
  const encrypted = sodium.crypto_box_seal(message, publicKey);
  return Buffer.from(encrypted).toString("base64");
}

/**
 * Push a secret to a GitHub repository's Actions secrets.
 * Performs the GET public-key + encrypt + PUT cycle.
 * Throws on non-2xx responses with a descriptive error.
 */
export async function pushRepoSecret(
  target: GithubTarget,
  secretName: string,
  value: string,
): Promise<{ status: number }> {
  const { owner, repo, token } = target;
  const baseUrl = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/actions/secrets`;
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "User-Agent": "synapse",
  };

  // 1. GET public key
  const pubKeyResp = await fetch(`${baseUrl}/public-key`, { headers });
  if (!pubKeyResp.ok) {
    const body = await pubKeyResp.text().catch(() => "");
    throw new Error(`获取 GitHub public key 失败 (${pubKeyResp.status}): ${body}`);
  }
  const pubKeyData = (await pubKeyResp.json()) as { key_id: string; key: string };

  // 2. Encrypt
  const encryptedValue = await encryptRepoSecret(value, pubKeyData.key);

  // 3. PUT secret
  const putResp = await fetch(`${baseUrl}/${encodeURIComponent(secretName)}`, {
    method: "PUT",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({ encrypted_value: encryptedValue, key_id: pubKeyData.key_id }),
  });
  if (!putResp.ok) {
    const body = await putResp.text().catch(() => "");
    throw new Error(`推送 GitHub secret 失败 (${putResp.status}): ${body}`);
  }

  return { status: putResp.status };
}
