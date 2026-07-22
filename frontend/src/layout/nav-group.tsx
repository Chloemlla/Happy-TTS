import { FaChevronRight } from 'react-icons/fa';
import { Link, useLocation } from 'react-router-dom';

import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from '@/components/ui/sidebar';
import { cn } from '@/lib/utils';

import { checkIsActive, isNavLink } from './url-utils';
import type { NavGroup as NavGroupProps, NavLink } from './types';

/**
 * Sidebar navigation group — flat links with drill-in chevrons where needed.
 */
export function NavGroup({ title, items }: NavGroupProps) {
  const pathname = useLocation().pathname;

  return (
    <SidebarGroup className='px-2 py-0.5'>
      <SidebarGroupLabel className='text-muted-foreground/65 h-7 px-2 text-[10px] font-semibold tracking-[0.14em] uppercase'>
        {title}
      </SidebarGroupLabel>
      <SidebarMenu className='gap-0.5'>
        {items.map((item) => {
          if (!isNavLink(item)) {
            if (item.items?.length) {
              return item.items.map((sub) => (
                <SidebarMenuLink
                  key={`${sub.title}-${sub.url}`}
                  item={sub as NavLink}
                  pathname={pathname}
                />
              ));
            }
            return null;
          }
          return (
            <SidebarMenuLink
              key={`${item.title}-${item.url}`}
              item={item}
              pathname={pathname}
            />
          );
        })}
      </SidebarMenu>
    </SidebarGroup>
  );
}

function SidebarMenuLink({
  item,
  pathname,
}: {
  item: NavLink;
  pathname: string;
}) {
  const { setOpenMobile } = useSidebar();
  const Icon = item.icon;
  const active = checkIsActive(pathname, item);
  // Drill-in workspace entries (admin) get a trailing chevron.
  const isDrillIn = item.matchChildren && item.url !== '/';

  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        isActive={active}
        tooltip={item.title}
        className={cn(
          'h-9 rounded-lg px-2.5 transition-colors',
          active &&
            'bg-sidebar-accent text-sidebar-accent-foreground shadow-[inset_0_0_0_1px_color-mix(in_oklch,var(--sidebar-primary)_18%,transparent)]',
          !active && 'text-sidebar-foreground/85 hover:text-sidebar-foreground',
        )}
        render={
          <Link to={item.url} onClick={() => setOpenMobile(false)} />
        }
      >
        {Icon ? (
          <span
            className={cn(
              'flex size-6 shrink-0 items-center justify-center rounded-md transition-colors',
              active
                ? 'bg-sidebar-primary/15 text-sidebar-primary'
                : 'bg-sidebar-accent/50 text-sidebar-foreground/70 group-hover/menu-button:bg-sidebar-accent group-hover/menu-button:text-sidebar-foreground',
            )}
          >
            <Icon className='size-3.5' aria-hidden='true' />
          </span>
        ) : null}
        <span className='min-w-0 flex-1 truncate text-[13px] font-medium'>
          {item.title}
        </span>
        {item.badge ? (
          <span className='bg-sidebar-primary/12 text-sidebar-primary shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-semibold'>
            {item.badge}
          </span>
        ) : null}
        {isDrillIn ? (
          <FaChevronRight
            className={cn(
              'size-3 shrink-0 opacity-40 transition-opacity group-data-[collapsible=icon]:hidden',
              active && 'opacity-70',
            )}
            aria-hidden='true'
          />
        ) : null}
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}
