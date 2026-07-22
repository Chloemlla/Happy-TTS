import { FaChevronLeft, FaShieldAlt } from 'react-icons/fa';
import { Link } from 'react-router-dom';

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
 * Nested-view chrome: back control + workspace identity (admin console, etc.).
 */
export function SidebarViewHeader({ view }: SidebarViewHeaderProps) {
  const { setOpenMobile } = useSidebar();
  const isAdmin = view.id === 'admin';

  return (
    <SidebarHeader className='border-sidebar-border gap-1 border-b px-2 py-2.5'>
      <SidebarMenu>
        <SidebarMenuItem>
          <SidebarMenuButton
            tooltip={view.parent.label}
            className={cn(
              'text-muted-foreground hover:text-foreground h-8 gap-1.5 rounded-lg',
              'font-medium',
            )}
            render={
              <Link to={view.parent.to} onClick={() => setOpenMobile(false)} />
            }
          >
            <FaChevronLeft className='size-3.5 shrink-0 opacity-70' aria-hidden='true' />
            <span className='truncate text-[13px]'>{view.parent.label}</span>
          </SidebarMenuButton>
        </SidebarMenuItem>
        <SidebarMenuItem>
          <div
            className={cn(
              'flex items-center gap-2.5 rounded-xl px-2 py-2',
              'bg-sidebar-accent/55 ring-1 ring-sidebar-border/80',
            )}
          >
            <span
              className={cn(
                'flex size-8 shrink-0 items-center justify-center rounded-lg',
                isAdmin
                  ? 'bg-sidebar-primary text-sidebar-primary-foreground shadow-sm'
                  : 'bg-muted text-muted-foreground',
              )}
            >
              <FaShieldAlt className='size-3.5' aria-hidden='true' />
            </span>
            <div className='grid min-w-0 flex-1 leading-tight group-data-[collapsible=icon]:hidden'>
              <span className='truncate text-sm font-semibold text-sidebar-foreground'>
                {isAdmin ? '管理后台' : view.id}
              </span>
              <span className='text-muted-foreground truncate text-[11px]'>
                {isAdmin ? '系统配置与运维' : '工作区'}
              </span>
            </div>
          </div>
        </SidebarMenuItem>
      </SidebarMenu>
    </SidebarHeader>
  );
}
