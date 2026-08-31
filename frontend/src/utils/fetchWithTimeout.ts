/**
 * Shared fetch wrapper that unifies timeout + abort behaviour for the bare
 * fetch call-sites that are not routed through the main axios instance
 * (turnstile.ts / fbi.ts / ipVerification.ts / fingerprint.ts / App.tsx mount fetches).
 *
 * It deliberately keeps the same `Response` contract as `fetch`, so callers
 * can be migrated incrementally without changing their error handling shape.
 */
export async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit = {},
  timeoutMs = 15000,
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);

  // Merge a caller-provided signal with our timeout abort so both can win.
  const callerSignal = init.signal;
  if (callerSignal) {
    if (callerSignal.aborted) {
      controller.abort();
    } else {
      callerSignal.addEventListener('abort', () => controller.abort(), { once: true });
    }
  }

  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    window.clearTimeout(timeoutId);
  }
}

/** Convenience alias to keep call-sites readable. */
export const fetchWithTimeoutJson = async <T = unknown>(
  input: RequestInfo | URL,
  init: RequestInit = {},
  timeoutMs?: number,
): Promise<T> => {
  const res = await fetchWithTimeout(input, init, timeoutMs);
  return (await res.json()) as T;
};
