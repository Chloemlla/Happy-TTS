import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Link } from 'react-router-dom';

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  SidebarSeparator,
} from '@/components/ui/sidebar';
import { cn } from '@/lib/utils';

import { NavGroup } from './nav-group';
import { SidebarViewHeader } from './sidebar-view-header';
import type { ResolvedSidebarView } from './types';

type AppSidebarProps = {
  viewState: ResolvedSidebarView;
  collapsible?: 'offcanvas' | 'icon' | 'none';
  variant?: 'sidebar' | 'floating' | 'inset';
};

const SLIDE = {
  initial: { opacity: 0, x: -10 },
  animate: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: 10 },
};

/**
 * Application sidebar — drill-in workspace chrome (new-api / Vercel style).
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
      {view ? (
        <SidebarViewHeader view={view} />
      ) : (
        <SidebarHeader className='border-sidebar-border gap-0 border-b px-2 py-2.5'>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                size='lg'
                tooltip='Synapse'
                className={cn(
                  'h-11 gap-2.5 px-2 data-active:bg-transparent',
                  'hover:bg-sidebar-accent/60',
                )}
                render={<Link to='/' />}
              >
                <span className='bg-primary text-primary-foreground flex size-8 shrink-0 items-center justify-center rounded-xl shadow-sm ring-1 ring-black/5'>
                  <img
                    src='/favicon.ico'
                    alt=''
                    className='h-[18px] w-[18px]'
                    width={18}
                    height={18}
                  />
                </span>
                <span className='grid min-w-0 flex-1 text-left leading-tight group-data-[collapsible=icon]:hidden'>
                  <span className='truncate text-sm font-semibold tracking-tight text-sidebar-foreground'>
                    Synapse
                  </span>
                  <span className='text-muted-foreground truncate text-[11px] font-medium'>
                    工作台
                  </span>
                </span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarHeader>
      )}

      <SidebarContent className='gap-1 px-0 py-2'>
        <AnimatePresence mode='wait' initial={false}>
          <motion.div
            key={key}
            initial={shouldReduce ? false : SLIDE.initial}
            animate={SLIDE.animate}
            exit={shouldReduce ? undefined : SLIDE.exit}
            transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
            className='flex flex-col gap-0.5'
          >
            {navGroups.map((group, index) => (
              <div key={group.id || group.title}>
                {index > 0 ? (
                  <SidebarSeparator className='my-1.5 opacity-60' />
                ) : null}
                <NavGroup {...group} />
              </div>
            ))}
          </motion.div>
        </AnimatePresence>
      </SidebarContent>

      <SidebarFooter className='border-sidebar-border border-t px-2 py-2 group-data-[collapsible=icon]:hidden'>
        <p className='text-muted-foreground/75 px-2 text-[10px] leading-relaxed'>
          {view
            ? '管理模块 · 点「返回」退出工作区'
            : '顶栏按钮或侧栏边缘可折叠 · 状态会记住'}
        </p>
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  );
}
