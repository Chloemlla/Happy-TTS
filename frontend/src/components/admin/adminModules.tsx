import React, { Suspense } from 'react';

import { SimpleLoadingSpinner } from '@/components/LoadingSpinner';

const LOADING_CARD_CLASS =
  'w-full rounded-[36px] border border-white/70 bg-white/88 px-6 py-8 text-center shadow-[0_24px_80px_rgba(15,23,42,0.08)] backdrop-blur-xl';
const LOADING_BADGE_CLASS =
  'mx-auto flex h-14 w-14 items-center justify-center rounded-[26px] bg-slate-100 text-slate-500';
const LOADING_EYEBROW_CLASS =
  'mt-5 text-sm font-semibold uppercase tracking-[0.26em] text-slate-400';

export const AdminModuleLoadingShell: React.FC<{ label?: string }> = ({
  label = '正在加载管理模块内容...',
}) => (
  <div
    role='status'
    aria-live='polite'
    aria-busy='true'
    className='mx-auto flex min-h-[46vh] max-w-3xl items-center justify-center px-4 py-10'
  >
    <div className={LOADING_CARD_CLASS}>
      <div className={LOADING_BADGE_CLASS}>
        <SimpleLoadingSpinner size={0.75} />
      </div>
      <div className={LOADING_EYEBROW_CLASS}>Synapse Route</div>
      <p className='mt-3 text-sm leading-7 text-slate-600'>{label}</p>
    </div>
  </div>
);

/**
 * Lazy-loaded admin module components, keyed by the `/admin/<module>` segment.
 * Mirrors the previous AdminDashboard tab map so deep links and the drill-in
 * sidebar can resolve modules without re-importing each page.
 */
export const ADMIN_MODULE_LOADERS = {
  users: () => import('@/components/UserManagement'),
  'registration-invites': () => import('@/components/RegistrationInviteManager'),
  librechat: () => import('@/components/LibreChatAdminPage'),
  ecoenchants: () => import('@/components/EcoEnchantsAdminPage'),
  announcement: () => import('@/components/AnnouncementManager'),
  'markdown-articles': () => import('@/components/MarkdownArticleManager'),
  env: () => import('@/components/EnvManager'),
  'mail-system': () => import('@/components/MailSystemConfigManager'),
  lottery: () => import('@/components/LotteryAdmin'),
  outemail: () => import('@/components/OutEmail'),
  shortlink: () => import('@/components/ShortLinkManager'),
  shorturlmigration: () => import('@/components/ShortUrlMigrationManager'),
  command: () => import('@/components/CommandManager'),
  humancheck: () => import('@/components/SmartHumanCheckTraces'),
  logshare: () => import('@/components/LogShare'),
  fbiwanted: () => import('@/components/FBIWantedManager'),
  webhookevents: () => import('@/components/WebhookEventsManager'),
  'data-collection': () => import('@/components/DataCollectionManager'),
  'github-billing-cache': () => import('@/components/GitHubBillingCacheManager'),
  'ip-ban': () => import('@/components/IPBanManager'),
  fingerprint: () => import('@/components/FingerprintManager'),
  broadcast: () => import('@/components/BroadcastManager'),
  oauth: () => import('@/components/OAuthClientManager'),
  apikeys: () => import('@/components/ApiKeyManager'),
  'apikey-billing': () =>
    import('@/components/ApiKeyManager').then((m) => ({
      default: function ApiKeyBilling() {
        return <m.default initialView='billing' />;
      },
    })),
  'audit-log': () => import('@/components/AuditLogViewer'),
  'translation-audit': () => import('@/components/TranslationAuditViewer'),
  'tts-history': () => import('@/components/TtsGenerationManager'),
  'rust-benchmark': () => import('@/components/RustBenchmarkDashboard'),
  system: () => import('@/components/SystemManager'),
} as const;

export type AdminModuleKey = keyof typeof ADMIN_MODULE_LOADERS;

export const ADMIN_MODULE_KEYS = Object.keys(
  ADMIN_MODULE_LOADERS,
) as AdminModuleKey[];

export function isAdminModuleKey(value: string): value is AdminModuleKey {
  return value in ADMIN_MODULE_LOADERS;
}

/** Lazy React components pre-bound for each module key. */
export const AdminModuleComponents: Record<
  AdminModuleKey,
  React.LazyExoticComponent<React.ComponentType<any>>
> = Object.fromEntries(
  ADMIN_MODULE_KEYS.map((key) => [
    key,
    React.lazy(ADMIN_MODULE_LOADERS[key] as () => Promise<{ default: React.ComponentType<any> }>),
  ]),
) as Record<AdminModuleKey, React.LazyExoticComponent<React.ComponentType<any>>>;

export function wrapAdminModule(
  Component: React.LazyExoticComponent<React.ComponentType<any>>,
  label?: string,
) {
  return (
    <Suspense fallback={<AdminModuleLoadingShell label={label} />}>
      <Component />
    </Suspense>
  );
}
