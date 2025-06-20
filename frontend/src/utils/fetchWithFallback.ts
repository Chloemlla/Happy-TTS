// 用于开发环境下主 API 失败时自动降级到 localhost:3000

export async function fetchWithFallback(input: string, init?: RequestInit) {
  const apiUrl = import.meta.env.VITE_API_URL;
  let url = input.startsWith('http') ? input : apiUrl + input;
  try {
    const res = await fetch(url, init);
    if (!res.ok) throw new Error('Primary API failed');
    return res;
  } catch (e) {
    // 仅开发环境降级
    if (import.meta.env.DEV && apiUrl && !url.startsWith('http://localhost:3000')) {
      try {
        const fallbackUrl = input.startsWith('http') ? input : 'http://localhost:3000' + input;
        const res2 = await fetch(fallbackUrl, init);
        return res2;
      } catch (e2) {
        throw e2;
      }
    }
    throw e;
  }
} 