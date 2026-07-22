import * as React from 'react';

/** Desktop sidebar layout breakpoint (matches the `md:` / `lg:` desktop split). */
const MOBILE_BREAKPOINT = 768;

/**
 * Returns whether the viewport is below the mobile breakpoint.
 *
 * Mirrors the new-api `useIsMobile` hook contract so the ported
 * `components/ui/sidebar.tsx` (mobile Sheet branch) behaves identically.
 * The value is `undefined` during the first render to avoid a hydration
 * mismatch, then resolves on mount.
 */
export function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState<boolean | undefined>(undefined);

  React.useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`);
    const onChange = () => {
      setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);
    };
    mql.addEventListener('change', onChange);
    setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);
    return () => mql.removeEventListener('change', onChange);
  }, []);

  return !!isMobile;
}
