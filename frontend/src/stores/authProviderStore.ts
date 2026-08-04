import { create } from "zustand";
import getApiBaseUrl from "../api";

interface GoogleAuthConfig {
  enabled: boolean;
  clientId: string;
}

interface LinuxDoAuthConfig {
  enabled: boolean;
}

interface AuthProviderState {
  google: GoogleAuthConfig;
  linuxdo: LinuxDoAuthConfig;
  /** true until the initial fetch settles */
  loading: boolean;
  /** true if the initial fetch completed (even on error) */
  initialized: boolean;
}

interface AuthProvidersPublicConfigResponse {
  google: {
    enabled: boolean;
    clientIdConfigured: boolean;
    clientId: string;
  };
  linuxdo: {
    enabled: boolean;
    clientIdConfigured: boolean;
    callbackUrl: string;
    discoveryUrl: string;
    scopes: string[];
  };
}

const fetchWithTimeout = (url: string, ms = 5000): Promise<Response> => {
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(), ms);
  return fetch(url, { signal: ctrl.signal, credentials: "include" }).finally(() => clearTimeout(id));
};

export const useAuthProviderStore = create<AuthProviderState>()((set) => {
  // Fire pre-fetch immediately on store creation (app startup)
  const init = async () => {
    try {
      const res = await fetchWithTimeout(`${getApiBaseUrl()}/api/auth/providers/public-config`);
      const data = (await res.json().catch(() => null)) as AuthProvidersPublicConfigResponse | null;

      if (data) {
        set({
          google: {
            enabled: Boolean(data.google.enabled && data.google.clientId),
            clientId: data.google.clientId || "",
          },
          linuxdo: {
            enabled: Boolean(data.linuxdo.enabled),
          },
          loading: false,
          initialized: true,
        });
      } else {
        set({ loading: false, initialized: true });
      }
    } catch {
      // On error, keep defaults (disabled) and mark as initialized
      set({ loading: false, initialized: true });
    }
  };

  // Fire and forget — don't block render
  void init();

  return {
    google: { enabled: false, clientId: "" },
    linuxdo: { enabled: false },
    loading: true,
    initialized: false,
  };
});