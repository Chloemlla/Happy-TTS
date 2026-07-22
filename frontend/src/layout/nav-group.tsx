import { Link, useLocation } from 'react-router-dom';

import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from '@/components/ui/sidebar';

import { checkIsActive, isNavLink } from './url-utils';
import type { NavGroup as NavGroupProps, NavLink } from './types';

/**
 * Sidebar navigation group.
 *
 * Synapse root/admin nav is flat (no nested collapsible items in the
 * sidebar itself — nesting is handled by the drill-in view swap). This
 * keeps the component free of Collapsible / DropdownMenu dependencies.
 */
export function NavGroup({ title, items }: NavGroupProps) {
  const pathname = useLocation().pathname;

  return (
    <SidebarGroup className='px-2 py-1'>
      <SidebarGroupLabel className='text-muted-foreground/70 px-2 text-[11px] font-medium tracking-wider uppercase'>
        {title}
      </SidebarGroupLabel>
      <SidebarMenu>
        {items.map((item) => {
          if (!isNavLink(item)) {
            // Collapsible items are not used in the Synapse sidebar yet;
            // fall through by rendering the first child if present.
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

  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        isActive={checkIsActive(pathname, item)}
        tooltip={item.title}
        render={
          <Link to={item.url} onClick={() => setOpenMobile(false)} />
        }
      >
        {Icon ? <Icon className='shrink-0' aria-hidden='true' /> : null}
        <span className='min-w-0 flex-1 truncate'>{item.title}</span>
        {item.badge ? (
          <span className='bg-sidebar-accent text-sidebar-accent-foreground shrink-0 rounded px-1 py-0 text-[10px] font-medium'>
            {item.badge}
          </span>
        ) : null}
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}
