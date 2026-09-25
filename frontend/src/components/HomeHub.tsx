import React, { memo, useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  FaArrowRight,
  FaChevronRight,
  FaHome,
  FaShieldAlt,
  FaUserCircle,
} from 'react-icons/fa';

import { getRootNavGroups } from '@/navigation/navConfig';
import { isNavLink } from '@/layout/url-utils';
import type { NavGroup, NavLink } from '@/layout/types';
import { useAuth } from '@/hooks/useAuth';
import { isAdminRole, isSuperAdmin } from '@/utils/rbac';
import { cn } from '@/utils/cn';
import { readRecentFeature } from '@/utils/recentFeature';
import {
  studioAccentBlobBlueClassName,
  studioAccentBlobSkyClassName,
  studioDisplayFont,
  studioElevatedPanelClassName,
  studioEyebrowAccentPillClassName,
  studioEyebrowClassName,
  studioHeroCardClassName,
  studioPageClassName,
  studioPageFont,
  studioPrimaryButtonClassName,
  studioSoftBadgeClassName,
  studioSubPanelClassName,
} from './studioTheme';

const CARD_CLASS = cn(
  studioElevatedPanelClassName,
  'group flex items-center gap-3 transition duration-150',
  'hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md',
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2',
);

const FeatureCard: React.FC<{ item: NavLink }> = ({ item }) => {
  const Icon = item.icon;
  return (
    <Link to={item.url} className={CARD_CLASS}>
      <span className={cn(studioSoftBadgeClassName, 'shrink-0')}>
        {Icon ? (
          <Icon className='text-slate-500 transition group-hover:text-slate-700' aria-hidden='true' />
        ) : (
          <FaChevronRight className='text-slate-400' aria-hidden='true' />
        )}
      </span>
      <span className='min-w-0 flex-1 truncate text-sm font-semibold text-slate-900'>
        {item.title}
      </span>
      <FaChevronRight
        className='size-3 shrink-0 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-slate-500'
        aria-hidden='true'
      />
    </Link>
  );
};

const FeatureGroup: React.FC<{ group: NavGroup; items: NavLink[] }> = ({ group, items }) => (
  <section className='min-w-0 space-y-4'>
    <div className='flex items-center gap-3'>
      <span className={studioEyebrowClassName}>{group.title}</span>
      <span className='h-px flex-1 bg-slate-200' aria-hidden='true' />
      <span className='text-[11px] font-semibold tabular-nums text-slate-400'>
        {items.length}
      </span>
    </div>
    <div className='grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3'>
      {items.map((item) => (
        <FeatureCard key={item.url} item={item} />
      ))}
    </div>
  </section>
);

/**
 * `/` — 综合服务平台首页。
 *
 * 用户登录后先落到这里，而不是直接进语音合成工作台：平台的职责是综合服务，
 * 语音合成只是其中一个能力。功能清单直接取 navConfig 这一份 SSOT，
 * 不另写卡片表，避免侧边栏与首页两处漂移。
 */
const HomeHubComponent: React.FC = () => {
  const { user } = useAuth();
  const visibilityContext = useMemo(
    () => ({
      isAdmin: isAdminRole(user?.role),
      isSuperAdmin: isSuperAdmin(user?.role),
      canUseTranslation: user?.isTranslationEnabled !== false,
    }),
    [user?.role, user?.isTranslationEnabled],
  );

  const groups = useMemo(
    () =>
      getRootNavGroups(visibilityContext)
        .filter((group) => group.id !== 'admin-entry')
        .map((group) => ({
          group,
          items: group.items.filter(isNavLink).filter((item) => item.url !== '/'),
        }))
        .filter((entry) => entry.items.length > 0),
    [visibilityContext],
  );

  const recentFeature = useMemo(
    () => readRecentFeature(visibilityContext),
    [visibilityContext],
  );

  const totalFeatures = groups.reduce((sum, entry) => sum + entry.items.length, 0);

  return (
    <div
      className={cn(studioPageClassName, 'min-w-0 max-w-full overflow-x-hidden')}
      style={{ fontFamily: studioPageFont }}
    >
      <div className='mx-auto w-full min-w-0 max-w-7xl space-y-5 sm:space-y-7'>
        <section className={studioHeroCardClassName}>
          <div className={cn(studioAccentBlobBlueClassName, '-right-12 top-0')} aria-hidden='true' />
          <div className={cn(studioAccentBlobSkyClassName, '-left-10 bottom-0')} aria-hidden='true' />

          <div className='relative flex min-w-0 flex-col gap-5 lg:flex-row lg:items-end lg:justify-between'>
            <div className='max-w-2xl min-w-0'>
              <div className={studioEyebrowAccentPillClassName}>
                <FaHome aria-hidden='true' />
                Synapse Platform
              </div>
              <h1
                className='mt-4 text-[2rem] font-semibold leading-[1.05] text-slate-900 sm:text-5xl sm:leading-tight'
                style={{ fontFamily: studioDisplayFont }}
              >
                综合服务平台
              </h1>
              <p className='mt-3 max-w-xl text-[13px] leading-6 text-slate-600 sm:text-base sm:leading-7'>
                语音合成只是 Synapse 的一个能力。这里汇集文本翻译、资源商店、
                效率工具与信息查询，按需要进入对应模块。
              </p>
            </div>

            <div className='w-full lg:w-auto lg:max-w-sm'>
              <div className={studioSubPanelClassName}>
                <div className={cn(studioEyebrowClassName, 'flex items-center gap-2')}>
                  <FaUserCircle className='text-slate-500' aria-hidden='true' />
                  Account
                </div>
                <div className='mt-3 text-sm font-semibold text-slate-900'>
                  {user ? user.username : '未登录'}
                </div>
                <p className='mt-1 text-xs leading-5 text-slate-600'>
                  共 {totalFeatures} 项可用功能，下方按类别展开。
                </p>
                {isAdminRole(user?.role) && (
                  <Link
                    to='/admin'
                    className={cn(
                      'mt-4 inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 transition hover:text-slate-800',
                    )}
                  >
                    <FaShieldAlt aria-hidden='true' />
                    管理后台
                  </Link>
                )}
              </div>
            </div>
          </div>
        </section>

        {recentFeature && (
          <section className={studioSubPanelClassName}>
            <div className='flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between'>
              <div className='flex min-w-0 items-center gap-3'>
                <span className={cn(studioSoftBadgeClassName, 'shrink-0')}>
                  <FaArrowRight className='text-slate-500' aria-hidden='true' />
                </span>
                <div className='min-w-0'>
                  <div className={studioEyebrowClassName}>继续上次</div>
                  <div className='mt-0.5 truncate text-sm font-semibold text-slate-900'>
                    {recentFeature.title}
                  </div>
                </div>
              </div>
              <Link
                to={recentFeature.url}
                className={cn(studioPrimaryButtonClassName, 'w-full shrink-0 sm:w-auto')}
              >
                <FaArrowRight aria-hidden='true' />
                继续
              </Link>
            </div>
          </section>
        )}

        <div className='min-w-0 space-y-6 sm:space-y-8'>
          {groups.map(({ group, items }) => (
            <FeatureGroup key={group.id || group.title} group={group} items={items} />
          ))}
        </div>
      </div>
    </div>
  );
};

export const HomeHub = memo(HomeHubComponent);
