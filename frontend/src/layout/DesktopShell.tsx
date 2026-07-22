import type { ReactNode } from 'react';

import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar';
import { useSidebarView } from '@/hooks/useSidebarView';

import { AppSidebar } from './app-sidebar';
import { getSidebarDefaultOpen } from './cookies';

type DesktopShellProps = {
  children: ReactNode;
};

/**
 * Desktop-only chrome: collapsible left sidebar + inset main area.
 * Lazy-loaded from App so Base UI / Hugeicons stay out of the entry chunk.
 */
export default function DesktopShell({ children }: DesktopShellProps) {
  const viewState = useSidebarView();

  return (
    <SidebarProvider
      defaultOpen={getSidebarDefaultOpen()}
      className='relative z-10 min-h-0 flex-1 flex-col'
    >
      <div className='flex min-h-0 w-full flex-1'>
        <AppSidebar viewState={viewState} collapsible='icon' />
        <SidebarInset className='min-h-0 overflow-auto bg-transparent'>
          {children}
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}
