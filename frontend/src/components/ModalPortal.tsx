import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';

/**
 * Mount dialogs on document.body so nested overlays escape transformed
 * ancestors (e.g. Framer scale on the TOTP shell) and always cover the viewport.
 */
export function ModalPortal({ children }: { children: ReactNode }) {
  if (typeof document === 'undefined') return null;
  return createPortal(children, document.body);
}

export default ModalPortal;
