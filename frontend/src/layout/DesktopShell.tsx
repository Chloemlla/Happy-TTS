import type { CSSProperties, ReactNode, Ref } from 'react';
import { useLocation } from 'react-router-dom';

import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from '@/components/ui/sidebar';
import { useSidebarView } from '@/hooks/useSidebarView';
import { cn } from '@/lib/utils';

import { checkIsActive, isNavLink } from './url-utils';
import { AppSidebar } from './app-sidebar';
import { getSidebarDefaultOpen } from './cookies';
import type { NavGroup } from './types';

type DesktopShellProps = {
  children: ReactNode;
  /** Right-side account controls (e.g. account-only MobileNav). */
  headerEnd?: ReactNode;
  /** Focus / scroll target for route changes (the scrollable main pane). */
  contentRef?: Ref<HTMLDivElement>;
};

function resolveHeaderLabel(
  pathname: string,
  navGroups: NavGroup[],
  isAdminView: boolean,
): string {
  let best: { title: string; len: number } | null = null;
  for (const group of navGroups) {
    for (const item of group.items) {
      if (!isNavLink(item)) continue;
      if (!checkIsActive(pathname, item)) continue;
      const len = item.url === '/' ? 1 : item.url.length;
      if (!best || len > best.len) best = { title: item.title, len };
    }
  }
  if (best) return best.title;
  return isAdminView ? '管理后台' : '工作台';
}

/**
 * Desktop-only chrome: collapsible left sidebar + inset with header trigger.
 * Lazy-loaded from App so Base UI / Hugeicons stay out of the entry chunk.
 *
 * Brand lives only in AppSidebar — header is collapse control + account.
 */
export default function DesktopShell({
  children,
  headerEnd,
  contentRef,
}: DesktopShellProps) {
  const viewState = useSidebarView();
  const { pathname } = useLocation();
  const headerLabel = resolveHeaderLabel(
    pathname,
    viewState.navGroups,
    Boolean(viewState.view),
  );

  return (
    <SidebarProvider
      defaultOpen={getSidebarDefaultOpen()}
      // Fill remaining viewport under outer flex column.
      className='relative z-10 flex h-full min-h-0 flex-1 flex-col'
      style={
        {
          // Full-height sidebar; chrome header sits inside the inset.
          '--app-header-height': '0px',
        } as CSSProperties
      }
    >
      <div className='flex h-full min-h-0 w-full flex-1'>
        <AppSidebar viewState={viewState} collapsible='icon' />
        <SidebarInset
          className={cn(
            'min-h-0 flex-1 overflow-hidden bg-transparent',
            'md:peer-data-[variant=inset]:bg-transparent',
          )}
        >
          <header
            aria-label='工作台工具栏'
            className={cn(
              'z-20 flex h-14 shrink-0 items-center gap-2',
              'border-b border-slate-200/80 bg-white/90 px-3 backdrop-blur-xl',
              'shadow-[0_1px_0_rgba(15,23,42,0.04)] sm:px-4',
            )}
          >
            <SidebarTrigger
              className='text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              aria-label='折叠/展开侧栏'
              title='折叠/展开侧栏'
            />
            <div className='min-w-0 flex-1 truncate text-sm font-semibold tracking-tight text-slate-800'>
              {headerLabel}
            </div>
            <div className='ml-auto flex shrink-0 items-center gap-2'>{headerEnd}</div>
          </header>
          <div
            id='app-main-content'
            ref={contentRef}
            role='main'
            tabIndex={-1}
            className='hover-scrollbar min-h-0 flex-1 overflow-auto outline-none'
          >
            {children}
          </div>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}
