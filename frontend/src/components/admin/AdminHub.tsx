import React from 'react';
import { Link, useParams } from 'react-router-dom';
import { FaChevronRight, FaShieldAlt } from 'react-icons/fa';

import {
  InfoBadge,
  InfoPanel,
  InfoQueryHero,
  InfoQueryShell,
  InfoSectionTitle,
} from '@/components/LogShareStyleScaffold';
import { getAdminNavGroups } from '@/navigation/navConfig';
import { useAuth } from '@/hooks/useAuth';
import { cn } from '@/lib/utils';

import {
  AdminModuleComponents,
  isAdminModuleKey,
  wrapAdminModule,
} from './adminModules';

/**
 * `/admin` index — module hub with grouped cards linking into drill-in routes.
 */
export const AdminHub: React.FC = () => {
  const { user } = useAuth();
  const groups = getAdminNavGroups().filter((g) => g.id !== 'admin-hub');
  const totalModules = groups.reduce((sum, g) => sum + g.items.length, 0);

  return (
    <InfoQueryShell className='logshare-admin-surface'>
      <div className='space-y-6'>
        <InfoQueryHero
          eyebrow='Admin Console'
          title='管理后台'
          description='系统管理与配置中心。桌面端可从左侧边栏 drill-in 直接切换模块；手机端请从「管理总览」进入本页浏览全部分组。'
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
            <div className='mt-4 grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3'>
              {group.items.map((item) => {
                if (!('url' in item) || !item.url) return null;
                const Icon = item.icon;
                return (
                  <Link
                    key={item.url}
                    to={item.url}
                    className={cn(
                      'group flex items-center gap-3 rounded-2xl border border-slate-200/90 bg-white/90 px-4 py-3.5',
                      'text-sm font-semibold text-slate-700 shadow-[0_1px_0_rgba(15,23,42,0.03)]',
                      'transition duration-150',
                      'hover:-translate-y-0.5 hover:border-indigo-200 hover:bg-white hover:text-slate-900',
                      'hover:shadow-[0_10px_30px_-18px_rgba(79,70,229,0.45)]',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 focus-visible:ring-offset-2',
                    )}
                  >
                    <span className='flex size-9 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-500 transition group-hover:bg-indigo-50 group-hover:text-indigo-600'>
                      {Icon ? (
                        <Icon className='size-4' aria-hidden='true' />
                      ) : (
                        <FaShieldAlt className='size-4' aria-hidden='true' />
                      )}
                    </span>
                    <span className='min-w-0 flex-1 truncate'>{item.title}</span>
                    <FaChevronRight
                      className='size-3 shrink-0 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-indigo-400'
                      aria-hidden='true'
                    />
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
            <div className='mx-auto mb-4 flex size-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-400'>
              <FaShieldAlt className='size-5' aria-hidden='true' />
            </div>
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
      <div className='min-h-[400px] rounded-[26px] border border-slate-200/90 bg-white/70 p-3 shadow-[0_18px_50px_-36px_rgba(15,23,42,0.35)] sm:p-5'>
        {wrapAdminModule(Component)}
      </div>
    </InfoQueryShell>
  );
};

export default AdminHub;
