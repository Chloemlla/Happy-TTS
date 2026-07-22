import type { CSSProperties, ReactNode } from 'react';

import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from '@/components/ui/sidebar';
import { useSidebarView } from '@/hooks/useSidebarView';
import { cn } from '@/lib/utils';

import { AppSidebar } from './app-sidebar';
import { getSidebarDefaultOpen } from './cookies';

type DesktopShellProps = {
  children: ReactNode;
  /** Right-side account controls (e.g. account-only MobileNav). */
  headerEnd?: ReactNode;
};

/**
 * Desktop-only chrome: collapsible left sidebar + inset with header trigger.
 * Lazy-loaded from App so Base UI / Hugeicons stay out of the entry chunk.
 *
 * Brand lives only in AppSidebar — header is collapse control + account.
 */
export default function DesktopShell({
  children,
  headerEnd,
}: DesktopShellProps) {
  const viewState = useSidebarView();

  return (
    <SidebarProvider
      defaultOpen={getSidebarDefaultOpen()}
      className='relative z-10 min-h-0 flex-1 flex-col'
      style={
        {
          // Full-height sidebar; chrome header sits inside the inset.
          '--app-header-height': '0px',
        } as CSSProperties
      }
    >
      <div className='flex min-h-0 w-full flex-1'>
        <AppSidebar viewState={viewState} collapsible='icon' />
        <SidebarInset
          className={cn(
            'min-h-0 bg-transparent',
            'md:peer-data-[variant=inset]:bg-transparent',
          )}
        >
          <header
            className={cn(
              'sticky top-0 z-20 flex h-14 shrink-0 items-center gap-2',
              'border-b border-slate-200/80 bg-white/90 px-3 backdrop-blur-xl',
              'shadow-[0_1px_0_rgba(15,23,42,0.04)] sm:px-4',
            )}
          >
            <SidebarTrigger
              className='text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              aria-label='折叠/展开侧栏'
              title='折叠/展开侧栏'
            />
            <div className='text-muted-foreground hidden min-w-0 flex-1 truncate text-xs font-medium sm:block'>
              {viewState.view
                ? '管理后台'
                : '工作台'}
            </div>
            <div className='ml-auto flex shrink-0 items-center gap-2'>{headerEnd}</div>
          </header>
          <div className='hover-scrollbar min-h-0 flex-1 overflow-auto'>{children}</div>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}
