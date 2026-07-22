import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';

import { Sidebar, SidebarContent, SidebarRail } from '@/components/ui/sidebar';

import { NavGroup } from './nav-group';
import { SidebarViewHeader } from './sidebar-view-header';
import type { ResolvedSidebarView } from './types';

type AppSidebarProps = {
  /** Resolved view from `useSidebarView()` (PR2). */
  viewState: ResolvedSidebarView;
  collapsible?: 'offcanvas' | 'icon' | 'none';
  variant?: 'sidebar' | 'floating' | 'inset';
};

const SLIDE = {
  initial: { opacity: 0, x: -8 },
  animate: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: 8 },
};

/**
 * Application sidebar.
 *
 * Adopts the Vercel / Cloudflare "drill-in" pattern: the URL drives which
 * sidebar *view* is rendered. Clicking a top-level entry like "管理后台"
 * swaps the sidebar to a contextual workspace with a "← 返回" affordance.
 *
 * View resolution lives in `useSidebarView` (PR2); this component is pure
 * presentation and only needs the already-resolved `viewState`.
 */
export function AppSidebar({
  viewState,
  collapsible = 'icon',
  variant = 'sidebar',
}: AppSidebarProps) {
  const { key, view, navGroups } = viewState;
  const shouldReduce = useReducedMotion();

  return (
    <Sidebar collapsible={collapsible} variant={variant}>
      {view ? <SidebarViewHeader view={view} /> : null}

      <SidebarContent className='py-2'>
        <AnimatePresence mode='wait' initial={false}>
          <motion.div
            key={key}
            initial={shouldReduce ? false : SLIDE.initial}
            animate={SLIDE.animate}
            exit={shouldReduce ? undefined : SLIDE.exit}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            className='flex flex-col'
          >
            {navGroups.map((group) => (
              <NavGroup key={group.id || group.title} {...group} />
            ))}
          </motion.div>
        </AnimatePresence>
      </SidebarContent>

      <SidebarRail />
    </Sidebar>
  );
}
