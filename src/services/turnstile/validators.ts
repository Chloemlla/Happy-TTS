export const sanitizeString = (input: string, maxLength: number = 1500): string | null => {
  if (!input || typeof input !== "string") {
    return null;
  }

  const sanitized = input.trim().substring(0, maxLength);

  const dangerousPatterns = [/[<>{}]/g, /javascript:/gi, /data:/gi, /vbscript:/gi, /on\w+\s*=/gi];

  let cleaned = sanitized;
  dangerousPatterns.forEach((pattern) => {
    cleaned = cleaned.replace(pattern, "");
  });

  return cleaned || null;
};

export const validateFingerprint = (fingerprint: string): string | null => {
  if (!fingerprint || typeof fingerprint !== "string") {
    return null;
  }

  const sanitized = sanitizeString(fingerprint, 200);
  if (!sanitized || sanitized.length < 8) {
    return null;
  }

  if (!/^[a-zA-Z0-9_-]+$/.test(sanitized)) {
    return null;
  }

  return sanitized;
};

export const validateToken = (token: string): string | null => {
  if (!token || typeof token !== "string") {
    return null;
  }

  const sanitized = sanitizeString(token, 2000);
  if (!sanitized || sanitized.length < 10) {
    return null;
  }

  if (!sanitized.trim()) {
    return null;
  }

  return sanitized;
};

export const validateIpAddress = (ip: string): string | null => {
  if (!ip || typeof ip !== "string") {
    return null;
  }

  const sanitized = sanitizeString(ip, 50);
  if (!sanitized) {
    return null;
  }

  if (sanitized.includes("/")) {
    const parts = sanitized.split("/");
    if (parts.length !== 2) {
      return null;
    }

    const [ipPart, prefixPart] = parts;
    const prefix = parseInt(prefixPart, 10);

    const ipv4Regex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
    if (ipv4Regex.test(ipPart)) {
      if (Number.isNaN(prefix) || prefix < 0 || prefix > 32) {
        return null;
      }
      return sanitized;
    }

    const ipv6Regex =
      /^(?:(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}|(?:[0-9a-fA-F]{1,4}:){1,7}:|(?:[0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|(?:[0-9a-fA-F]{1,4}:){1,5}(?::[0-9a-fA-F]{1,4}){1,2}|(?:[0-9a-fA-F]{1,4}:){1,4}(?::[0-9a-fA-F]{1,4}){1,3}|(?:[0-9a-fA-F]{1,4}:){1,3}(?::[0-9a-fA-F]{1,4}){1,4}|(?:[0-9a-fA-F]{1,4}:){1,2}(?::[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:(?::[0-9a-fA-F]{1,4}){1,6}|:(?:(?::[0-9a-fA-F]{1,4}){1,7}|:)|::)$/;
    if (ipv6Regex.test(ipPart)) {
      if (Number.isNaN(prefix) || prefix < 0 || prefix > 128) {
        return null;
      }
      return sanitized;
    }

    return null;
  }

  const ipv4Regex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
  const ipv6Regex =
    /^(?:(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}|(?:[0-9a-fA-F]{1,4}:){1,7}:|(?:[0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|(?:[0-9a-fA-F]{1,4}:){1,5}(?::[0-9a-fA-F]{1,4}){1,2}|(?:[0-9a-fA-F]{1,4}:){1,4}(?::[0-9a-fA-F]{1,4}){1,3}|(?:[0-9a-fA-F]{1,4}:){1,3}(?::[0-9a-fA-F]{1,4}){1,4}|(?:[0-9a-fA-F]{1,4}:){1,2}(?::[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:(?::[0-9a-fA-F]{1,4}){1,6}|:(?:(?::[0-9a-fA-F]{1,4}){1,7}|:)|::)$/;

  if (ipv4Regex.test(sanitized) || ipv6Regex.test(sanitized)) {
    return sanitized;
  }

  return null;
};

export const validateConfigKey = (key: string): "TURNSTILE_SECRET_KEY" | "TURNSTILE_SITE_KEY" | null => {
  if (!key || typeof key !== "string") {
    return null;
  }

  const validKeys = ["TURNSTILE_SECRET_KEY", "TURNSTILE_SITE_KEY"];
  return validKeys.includes(key) ? (key as "TURNSTILE_SECRET_KEY" | "TURNSTILE_SITE_KEY") : null;
};

export const validateConfigValue = (value: string): string | null => {
  if (!value || typeof value !== "string") {
    return null;
  }

  const sanitized = sanitizeString(value, 1000);
  if (!sanitized || sanitized.length < 1) {
    return null;
  }

  return sanitized;
};
