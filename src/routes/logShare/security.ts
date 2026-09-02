export function sanitizeFileName(fileName: string): string {
  if (!fileName || typeof fileName !== "string") {
    return "unknown";
  }
  let result = fileName.replace(/[<>:"/\\|?*\x00-\x1f]/g, "_");

  // 循环剥离首尾点号而非用正则，避免 ReDoS
  while (result.startsWith(".")) {
    result = `_${result.slice(1)}`;
  }

  while (result.endsWith(".")) {
    result = `${result.slice(0, -1)}_`;
  }

  return result.slice(0, 255);
}

export function sanitizePathComponent(component: string): string {
  if (!component || typeof component !== "string") {
    return "";
  }
  return component
    .replace(/[.]{2,}/g, "_")
    .replace(/[/\\]/g, "_")
    .replace(/[<>:"|?*\x00-\x1f]/g, "_")
    .slice(0, 255);
}

export function sanitizeRegexPattern(pattern: string): string {
  if (!pattern || typeof pattern !== "string") {
    return "";
  }
  return pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").slice(0, 100);
}

export function validateFileId(fileId: string): boolean {
  if (!fileId || typeof fileId !== "string") {
    return false;
  }
  return /^[a-zA-Z0-9-]{1,64}$/.test(fileId);
}

export function validateArchiveName(archiveName: string): boolean {
  if (!archiveName || typeof archiveName !== "string") {
    return false;
  }
  return /^[a-zA-Z0-9-_]{1,100}$/.test(archiveName);
}
