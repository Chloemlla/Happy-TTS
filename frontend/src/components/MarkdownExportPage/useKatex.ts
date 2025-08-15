import { useEffect, useState } from 'react';
import { marked } from 'marked';

let katexCssLoaded = false;
let katexExtensionApplied = false;

const ensureKatexStylesLoaded = async () => {
  if (katexCssLoaded) return;
  try {
    await import('katex/dist/katex.min.css');
    katexCssLoaded = true;
  } catch {
    // ignore style load errors
  }
};

export const hasMath = (md: string): boolean => {
  if (!md) return false;
  return /\$\$[\s\S]*?\$\$/.test(md) || /(^|\s)\$[^$\n]+\$(?=\s|$)/.test(md) || /\\\([\s\S]*?\\\)/.test(md) || /\\\[[\s\S]*?\\\]/.test(md);
};

export function useKatex(markdownContent: string): boolean {
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    let mounted = true;
    const run = async () => {
      if (!hasMath(markdownContent)) {
        if (mounted) setIsReady(true);
        return;
      }
      await ensureKatexStylesLoaded();
      try {
        if (!katexExtensionApplied) {
          const { default: markedKatex } = await import('marked-katex-extension');
          marked.use(markedKatex({ nonStandard: true }));
          katexExtensionApplied = true;
        }
      } catch {
        // ignore extension load failure
      }
      try {
        const fontsReady = (typeof document !== 'undefined') &&
          (document as any).fonts &&
          (document as any).fonts.ready &&
          typeof (document as any).fonts.ready.then === 'function';
        if (fontsReady) {
          await (document as any).fonts.ready;
        } else {
          await new Promise(res => setTimeout(res, 200));
        }
      } catch {
        // ignore
      }
      if (mounted) setIsReady(true);
    };
    run();
    return () => { mounted = false; };
  }, [markdownContent]);

  return isReady;
}
