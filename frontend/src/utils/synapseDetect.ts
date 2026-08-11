const STORAGE_KEY = 'synapse_checking';

/**
 * Check if the synapse:// custom URL scheme is available on this device.
 *
 * Uses a two-phase approach:
 * 1. On first call, navigates to synapse://ping via window.location.href.
 *    If the app is installed, Chrome opens it and the page navigates away;
 *    when the user returns, the page reloads and phase 2 detects the flag.
 * 2. If the app is not installed, the page stays and a timeout resolves false.
 *
 * On non-Android devices, always returns false.
 */
export async function checkSynapseClientAvailable(): Promise<boolean> {
  const isAndroid = /android/i.test(navigator.userAgent);
  if (!isAndroid) return false;

  // Phase 2: returning from the app after a detection attempt
  const wasChecking = sessionStorage.getItem(STORAGE_KEY);
  if (wasChecking) {
    sessionStorage.removeItem(STORAGE_KEY);
    return true;
  }

  // Phase 1: start detection
  sessionStorage.setItem(STORAGE_KEY, 'true');

  // Navigate to the custom scheme to trigger the app
  window.location.href = 'synapse://ping';

  // If the app is not installed, the page stays visible
  return new Promise<boolean>((resolve) => {
    const timer = setTimeout(() => {
      sessionStorage.removeItem(STORAGE_KEY);
      resolve(false);
    }, 1500);

    // If the app opens, the page loses visibility
    const onVisibilityChange = () => {
      if (document.hidden) {
        clearTimeout(timer);
        // Don't resolve here — page will navigate away.
        // On return, phase 2 will detect the flag.
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange, { once: true });
  });
}