/**
 * Check if the synapse:// custom URL scheme is available on this device.
 * Works on Android via the blur/focus timeout pattern:
 * 1. Try to navigate to synapse://ping
 * 2. If the page loses focus within a short timeout, the scheme was handled
 * 3. If not, the scheme is not available
 *
 * On non-Android devices, always returns false.
 */
export async function checkSynapseClientAvailable(): Promise<boolean> {
  // Only attempt on Android
  const isAndroid = /android/i.test(navigator.userAgent);
  if (!isAndroid) return false;

  // Use the blur/focus timeout pattern
  return new Promise((resolve) => {
    const TIMEOUT_MS = 800;
    let handled = false;
    let timer: ReturnType<typeof setTimeout>;

    const onBlur = () => {
      handled = true;
      clearTimeout(timer);
      resolve(true);
    };

    window.addEventListener('blur', onBlur, { once: true });

    // Create an invisible iframe to trigger the custom scheme
    const iframe = document.createElement('iframe');
    iframe.style.display = 'none';
    iframe.src = 'synapse://ping';
    document.body.appendChild(iframe);

    // Fallback: also try window.location as a secondary trigger
    // (some browsers need this for custom schemes)
    timer = setTimeout(() => {
      window.removeEventListener('blur', onBlur);
      if (!handled) {
        // Try one more time with a different approach
        const link = document.createElement('a');
        link.style.display = 'none';
        link.href = 'synapse://ping';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        // Final timeout
        setTimeout(() => {
          document.body.removeChild(iframe);
          resolve(false);
        }, TIMEOUT_MS);
      } else {
        document.body.removeChild(iframe);
      }
    }, TIMEOUT_MS);
  });
}