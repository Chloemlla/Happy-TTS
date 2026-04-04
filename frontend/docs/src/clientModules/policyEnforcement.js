(function () {
  'use strict';

  if (typeof window === 'undefined') {
    return;
  }

  const STORAGE_KEY = 'hapxtts_policy_consent';

  window.__policyEnforcement = {
    checkConsent() {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      try {
        return raw ? JSON.parse(raw) : null;
      } catch {
        return null;
      }
    },
    clearConsent() {
      window.localStorage.removeItem(STORAGE_KEY);
    },
  };
})();
