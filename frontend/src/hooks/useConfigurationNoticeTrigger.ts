import { useEffect } from 'react';
import { getApiBaseUrl } from '../api/api';

const FRONTEND_VISIT_SESSION_KEY = 'synapse:configuration-notice-visit:v1';

function removeVisitMarker(): void {
  try {
    window.sessionStorage.removeItem(FRONTEND_VISIT_SESSION_KEY);
  } catch {
    // A blocked storage API must not affect application startup.
  }
}

function claimVisitMarker(): boolean {
  try {
    if (window.sessionStorage.getItem(FRONTEND_VISIT_SESSION_KEY)) {
      return false;
    }
    window.sessionStorage.setItem(FRONTEND_VISIT_SESSION_KEY, '1');
  } catch {
    // Continue without client-side deduplication; the backend is authoritative.
  }
  return true;
}

export function useConfigurationNoticeTrigger(): void {
  useEffect(() => {
    if (!claimVisitMarker()) {
      return;
    }

    void fetch(`${getApiBaseUrl()}/api/health/frontend-visit`, {
      method: 'POST',
      credentials: 'same-origin',
      headers: {
        'X-Requested-With': 'XMLHttpRequest',
      },
      keepalive: true,
    })
      .then((response) => {
        if (!response.ok) {
          removeVisitMarker();
        }
      })
      .catch(() => removeVisitMarker());
  }, []);
}
