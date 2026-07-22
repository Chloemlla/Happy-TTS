import { Link } from 'react-router-dom';
import { FaChevronLeft } from 'react-icons/fa';

import {
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from '@/components/ui/sidebar';
import { cn } from '@/lib/utils';

import type { SidebarView } from './types';

type SidebarViewHeaderProps = {
  view: SidebarView;
};

/**
 * Header for a nested sidebar view (Vercel / Cloudflare drill-in pattern).
 *
 * Renders only the back affordance — workspace context is conveyed by
 * the nav groups below, not a redundant title row.
 */
export function SidebarViewHeader({ view }: SidebarViewHeaderProps) {
  const { setOpenMobile } = useSidebar();

  return (
    <SidebarHeader className='border-sidebar-border border-b px-2 py-2'>
      <SidebarMenu>
        <SidebarMenuItem>
          <SidebarMenuButton
            tooltip={view.parent.label}
            className={cn(
              'text-muted-foreground hover:text-foreground',
              'gap-1.5 font-medium',
            )}
            render={
              <Link
                to={view.parent.to}
                onClick={() => setOpenMobile(false)}
              />
            }
          >
            <FaChevronLeft className='size-3.5 shrink-0' aria-hidden='true' />
            <span className='truncate'>{view.parent.label}</span>
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
    </SidebarHeader>
  );
}
