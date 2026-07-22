import React from 'react';
import { Link, useParams } from 'react-router-dom';
import { FaShieldAlt } from 'react-icons/fa';

import {
  InfoBadge,
  InfoPanel,
  InfoQueryHero,
  InfoQueryShell,
  InfoSectionTitle,
} from '@/components/LogShareStyleScaffold';
import { getAdminNavGroups } from '@/navigation/navConfig';
import { useAuth } from '@/hooks/useAuth';

import {
  AdminModuleComponents,
  isAdminModuleKey,
  wrapAdminModule,
} from './adminModules';

/**
 * `/admin` index — module hub with grouped cards linking into drill-in routes.
 * Desktop users also have the full list in the drill-in sidebar; this page
 * doubles as a landing overview and a mobile-friendly entry.
 */
export const AdminHub: React.FC = () => {
  const { user } = useAuth();
  const groups = getAdminNavGroups();
  const totalModules = groups.reduce((sum, g) => sum + g.items.length, 0);

  return (
    <InfoQueryShell className='logshare-admin-surface'>
      <div className='space-y-6'>
        <InfoQueryHero
          eyebrow='Admin Console'
          title='管理后台'
          description='系统管理与配置中心。桌面端可从左侧边栏 drill-in 视图直接切换模块；此处为分组总览。'
          icon={FaShieldAlt}
          tone='slate'
          meta={
            <>
              <InfoBadge tone='slate'>管理员 {user?.username}</InfoBadge>
              <InfoBadge tone='emerald'>权限已验证</InfoBadge>
              <InfoBadge tone='slate'>{totalModules} 个模块</InfoBadge>
            </>
          }
        />

        {groups.map((group) => (
          <InfoPanel key={group.id || group.title}>
            <InfoSectionTitle
              title={group.title}
              icon={FaShieldAlt}
              eyebrow='Modules'
            />
            <div className='mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3'>
              {group.items.map((item) => {
                if (!('url' in item) || !item.url) return null;
                const Icon = item.icon;
                return (
                  <Link
                    key={item.url}
                    to={item.url}
                    className='flex items-center gap-3 rounded-2xl border border-slate-200 bg-white/80 px-4 py-3 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-white hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2'
                  >
                    {Icon ? (
                      <Icon
                        className='shrink-0 text-slate-400'
                        size={16}
                        aria-hidden='true'
                      />
                    ) : null}
                    <span className='truncate'>{item.title}</span>
                  </Link>
                );
              })}
            </div>
          </InfoPanel>
        ))}
      </div>
    </InfoQueryShell>
  );
};

/**
 * `/admin/:module` — renders the module matched by the URL segment.
 */
export const AdminModulePage: React.FC = () => {
  const { module } = useParams<{ module: string }>();

  if (!module || !isAdminModuleKey(module)) {
    return (
      <InfoQueryShell className='logshare-admin-surface'>
        <InfoPanel>
          <div className='py-16 text-center'>
            <h2 className='text-xl font-semibold text-slate-900'>
              未找到管理模块
            </h2>
            <p className='mt-2 text-sm text-slate-500'>
              路径 <code className='font-mono'>{module}</code> 不在已注册模块中。
            </p>
            <Link
              to='/admin'
              className='mt-6 inline-flex rounded-2xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-slate-800'
            >
              返回管理总览
            </Link>
          </div>
        </InfoPanel>
      </InfoQueryShell>
    );
  }

  const Component = AdminModuleComponents[module];
  return (
    <InfoQueryShell className='logshare-admin-surface'>
      <div className='min-h-[400px] rounded-[26px] border border-slate-200 bg-white/60 p-3 sm:p-5'>
        {wrapAdminModule(Component)}
      </div>
    </InfoQueryShell>
  );
};

export default AdminHub;
