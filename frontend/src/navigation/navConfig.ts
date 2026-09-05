import type { IconType } from 'react-icons';
import {
  FaBars,
  FaBirthdayCake,
  FaBook,
  FaBug,
  FaChartBar,
  FaComments,
  FaCoins,
  FaDatabase,
  FaDollarSign,
  FaEnvelope,
  FaExchangeAlt,
  FaExclamationTriangle,
  FaFileAlt,
  FaFlask,
  FaFont,
  FaGamepad,
  FaGavel,
  FaGift,
  FaHeadset,
  FaImage,
  FaLanguage,
  FaLink,
  FaList,
  FaPaperPlane,
  FaSearch,
  FaShareAlt,
  FaShieldAlt,
  FaStore,
  FaTerminal,
  FaUser,
  FaUserShield,
  FaVolumeUp,
} from 'react-icons/fa';

import type { NavGroup, NavItem } from '@/layout/types';

/**
 * Shared navigation configuration (SSOT) for AppSidebar + MobileNav + AdminHub.
 *
 * Desktop: useSidebarView → getRootNavGroups / getAdminNavGroups
 * Mobile:  getMobileRootNavGroups / getMobileAdminNavGroups
 */

export type NavVisibilityContext = {
  isAdmin: boolean;
  isSuperAdmin: boolean;
  canUseTranslation: boolean;
};

function filterByVisibility(
  items: NavItem[],
  ctx: NavVisibilityContext,
): NavItem[] {
  return items.filter((item) => {
    if (item.requiredRole === 'admin' && !ctx.isAdmin) return false;
    if (item.requiredRole === 'superadmin' && !ctx.isSuperAdmin) return false;
    // Translation-gated items use a sentinel url check below via id/url.
    if ('url' in item && item.url === '/translate' && !ctx.canUseTranslation) {
      return false;
    }
    return true;
  });
}

/** Root sidebar / mobile page-nav groups. */
export function getRootNavGroups(ctx: NavVisibilityContext): NavGroup[] {
  const groups: NavGroup[] = [
    {
      id: 'core',
      title: '核心功能',
      items: filterByVisibility(
        [
          { title: '语音合成', url: '/', icon: FaVolumeUp as IconType },
          {
            title: '资源商店',
            url: '/store',
            icon: FaStore as IconType,
            matchChildren: true,
          },
          {
            title: '文本翻译',
            url: '/translate',
            icon: FaLanguage as IconType,
          },
          { title: '个人中心', url: '/profile', icon: FaUser as IconType },
          { title: '支持中心', url: '/support', icon: FaHeadset as IconType },
        ],
        ctx,
      ),
    },
    {
      id: 'tools',
      title: '实用工具',
      items: filterByVisibility(
        [
          {
            title: '日志分享',
            url: '/logshare',
            icon: FaShareAlt as IconType,
            requiredRole: 'admin',
          },
          { title: '图片上传', url: '/image-upload', icon: FaImage as IconType },
          {
            title: '公共短链',
            url: '/public-shortlink',
            icon: FaLink as IconType,
          },
          {
            title: '大小写转换',
            url: '/case-converter',
            icon: FaFont as IconType,
          },
          {
            title: '字数统计',
            url: '/word-count',
            icon: FaChartBar as IconType,
          },
          {
            title: '年龄计算',
            url: '/age-calculator',
            icon: FaBirthdayCake as IconType,
          },
          {
            title: 'MD 导出',
            url: '/markdown-export',
            icon: FaFileAlt as IconType,
          },
          {
            title: 'GitHub 账单',
            url: '/github-billing',
            icon: FaDollarSign as IconType,
          },
          {
            title: '模组列表',
            url: '/modlist',
            icon: FaList as IconType,
            requiredRole: 'admin',
          },
          {
            title: '外部邮件',
            url: '/outemail',
            icon: FaEnvelope as IconType,
            requiredRole: 'admin',
          },
        ],
        ctx,
      ),
    },
    {
      id: 'playground',
      title: '娱乐与探索',
      items: filterByVisibility(
        [
          { title: '抽奖系统', url: '/lottery', icon: FaGift as IconType },
          {
            title: '老虎冒险',
            url: '/tiger-adventure',
            icon: FaGamepad as IconType,
          },
          {
            title: '硬币翻转',
            url: '/coin-flip',
            icon: FaExchangeAlt as IconType,
          },
          {
            title: 'LibreChat',
            url: '/librechat',
            icon: FaComments as IconType,
          },
        ],
        ctx,
      ),
    },
    {
      id: 'info',
      title: '信息与查询',
      items: filterByVisibility(
        [
          {
            title: 'FBI 通缉',
            url: '/fbi-wanted',
            icon: FaSearch as IconType,
          },
          {
            title: '安踏防伪',
            url: '/anti-counterfeit',
            icon: FaShieldAlt as IconType,
          },
          {
            title: '校园紧急',
            url: '/campus-emergency',
            icon: FaExclamationTriangle as IconType,
          },
          { title: 'API 文档', url: '/api-docs', icon: FaBook as IconType, requiredRole: 'admin' },
          { title: '服务条款', url: '/policy', icon: FaGavel as IconType },
        ],
        ctx,
      ),
    },
  ];

  if (ctx.isAdmin) {
    groups.push({
      id: 'demo',
      title: '测试与演示',
      items: [
        {
          title: '演示中心',
          url: '/demo',
          icon: FaFlask as IconType,
          matchChildren: true,
        },
        {
          title: '人机验证',
          url: '/smart-human-check',
          icon: FaBug as IconType,
        },
        {
          title: '通知测试',
          url: '/notification-test',
          icon: FaEnvelope as IconType,
        },
        {
          title: 'hCaptcha',
          url: '/hcaptcha-verify',
          icon: FaShieldAlt as IconType,
        },
      ],
    });

    // Drill-in entry: clicking this swaps the whole sidebar to ADMIN_VIEW.
    groups.push({
      id: 'admin-entry',
      title: '管理',
      items: [
        {
          title: '管理后台',
          url: '/admin',
          icon: FaUserShield as IconType,
          matchChildren: true,
          requiredRole: 'admin',
        },
      ],
    });
  }

  return groups.filter((g) => g.items.length > 0);
}

/**
 * Admin drill-in sidebar groups + AdminHub cards.
 * Each item points at `/admin/<module>` or a dedicated admin route.
 */
export function getAdminNavGroups(ctx: NavVisibilityContext): NavGroup[] {
  return [
    {
      id: 'admin-hub',
      title: '总览',
      items: filterByVisibility(
        [
          {
            title: '管理总览',
            url: '/admin',
            icon: FaUserShield as IconType,
            // exact match only — children must not keep this lit
          },
        ],
        ctx,
      ),
    },
    {
      id: 'admin-identity',
      title: '身份与权限',
      items: filterByVisibility(
        [
          {
            title: '用户管理',
            url: '/admin/users',
            icon: FaUserShield as IconType,
            requiredRole: 'admin',
          },
          {
            title: '注册邀请码',
            url: '/admin/registration-invites',
            icon: FaList as IconType,
          },
          {
            title: 'API Key 管理',
            url: '/admin/apikeys',
            icon: FaDatabase as IconType,
            requiredRole: 'admin',
          },
          {
            title: 'API Key 计费',
            url: '/admin/apikey-billing',
            icon: FaDollarSign as IconType,
          },
          {
            title: '操作审计',
            url: '/admin/audit-log',
            icon: FaFileAlt as IconType,
            requiredRole: 'admin',
          },
          {
            title: '翻译审计',
            url: '/admin/translation-audit',
            icon: FaLanguage as IconType,
            requiredRole: 'admin',
          },
          {
            title: 'TTS 生成记录',
            url: '/admin/tts-history',
            icon: FaVolumeUp as IconType,
            requiredRole: 'admin',
          },
        ],
        ctx,
      ),
    },
    {
      id: 'admin-integration',
      title: '第三方接入',
      items: filterByVisibility(
        [
          {
            title: 'OAuth 接入',
            url: '/admin/oauth',
            icon: FaLink as IconType,
            requiredRole: 'admin',
          },
          {
            title: 'LibreChat 管理',
            url: '/admin/librechat',
            icon: FaComments as IconType,
          },
          {
            title: 'EcoEnchants 授权',
            url: '/admin/ecoenchants',
            icon: FaShieldAlt as IconType,
            requiredRole: 'superadmin',
          },
          {
            title: 'EcoEnchants 远程运维',
            url: '/admin/ecoenchants-ops',
            icon: FaTerminal as IconType,
            requiredRole: 'superadmin',
          },
          {
            title: 'Webhook 事件',
            url: '/admin/webhookevents',
            icon: FaExchangeAlt as IconType,
          },
          {
            title: 'PiliPlus 设置同步',
            url: '/admin/bilibili-sync',
            icon: FaDatabase as IconType,
          },
        ],
        ctx,
      ),
    },
    {
      id: 'admin-operations',
      title: '运营与内容',
      items: filterByVisibility(
        [
          {
            title: '公告管理',
            url: '/admin/announcement',
            icon: FaFileAlt as IconType,
          },
          {
            title: 'Markdown 文章',
            url: '/admin/markdown-articles',
            icon: FaBook as IconType,
            requiredRole: 'superadmin',
          },
          {
            title: '抽奖管理',
            url: '/admin/lottery',
            icon: FaGift as IconType,
            requiredRole: 'superadmin',
          },
          {
            title: '硬币翻转记录',
            url: '/admin/coin-flip',
            icon: FaCoins as IconType,
            requiredRole: 'admin',
          },
          {
            title: '外部邮件',
            url: '/admin/outemail',
            icon: FaEnvelope as IconType,
          },
          {
            title: '短链管理',
            url: '/admin/shortlink',
            icon: FaLink as IconType,
            requiredRole: 'superadmin',
          },
          {
            title: '短链迁移',
            url: '/admin/shorturlmigration',
            icon: FaExchangeAlt as IconType,
            requiredRole: 'superadmin',
          },
          {
            title: '命令管理',
            url: '/admin/command',
            icon: FaBars as IconType,
            requiredRole: 'superadmin',
          },
          {
            title: '日志分享',
            url: '/admin/logshare',
            icon: FaShareAlt as IconType,
          },
          {
            title: 'FBI 通缉犯管理',
            url: '/admin/fbiwanted',
            icon: FaSearch as IconType,
            requiredRole: 'superadmin',
          },
          {
            title: '广播推送',
            url: '/admin/broadcast',
            icon: FaPaperPlane as IconType,
            requiredRole: 'superadmin',
          },
          {
            title: '商店管理',
            url: '/admin/store',
            icon: FaStore as IconType,
            matchChildren: true,
          },
          {
            title: '资源管理',
            url: '/admin/store/resources',
            icon: FaDatabase as IconType,
          },
          {
            title: 'CDK 管理',
            url: '/admin/store/cdks',
            icon: FaList as IconType,
            requiredRole: 'superadmin',
          },
          {
            title: '邮件发送',
            url: '/email-sender',
            icon: FaPaperPlane as IconType,
            requiredRole: 'superadmin',
          },
          {
            title: '安全监控',
            url: '/nexai-security',
            icon: FaShieldAlt as IconType,
          },
        ],
        ctx,
      ),
    },
    {
      id: 'admin-security',
      title: '安全与系统',
      items: filterByVisibility(
        [
          {
            title: '环境变量',
            url: '/admin/env',
            icon: FaDatabase as IconType,
            requiredRole: 'superadmin',
          },
          {
            title: '邮件系统配置',
            url: '/admin/mail-system',
            icon: FaEnvelope as IconType,
            requiredRole: 'superadmin',
          },
          {
            title: '人机验证日志',
            url: '/admin/humancheck',
            icon: FaBug as IconType,
          },
          {
            title: '数据收集管理',
            url: '/admin/data-collection',
            icon: FaChartBar as IconType,
            requiredRole: 'admin',
          },
          {
            title: '崩溃报告',
            url: '/admin/crash-reports',
            icon: FaBug as IconType,
            requiredRole: 'admin',
          },
          {
            title: 'QQ 群纪律',
            url: '/admin/qq-guard',
            icon: FaShieldAlt as IconType,
            requiredRole: 'admin',
          },
          {
            title: 'GitHub 账单缓存',
            url: '/admin/github-billing-cache',
            icon: FaDollarSign as IconType,
          },
          {
            title: 'IP 封禁管理',
            url: '/admin/ip-ban',
            icon: FaShieldAlt as IconType,
            requiredRole: 'superadmin',
          },
          {
            title: '指纹管理',
            url: '/admin/fingerprint',
            icon: FaSearch as IconType,
            requiredRole: 'superadmin',
          },
          {
            title: '系统管理',
            url: '/admin/system',
            icon: FaBars as IconType,
            requiredRole: 'superadmin',
          },
          {
            title: '篡改检测',
            url: '/tamper-detection-demo',
            icon: FaBug as IconType,
          },
        ],
        ctx,
      ),
    },
  ].filter((g) => g.items.length > 0);
}

/**
 * URLs whose NavItem is `requiredRole: 'superadmin'` (SSOT from
 * getAdminNavGroups). Used to gate direct-URL access to module pages:
 * the hub/sidebar already hide these for plain admins, but a deep link
 * would otherwise still render them.
 */
export function getSuperAdminOnlyPaths(): Set<string> {
  const fullCtx: NavVisibilityContext = {
    isAdmin: true,
    isSuperAdmin: true,
    canUseTranslation: true,
  };
  const paths = new Set<string>();
  for (const group of getAdminNavGroups(fullCtx)) {
    for (const item of group.items) {
      if ('url' in item && item.url && item.requiredRole === 'superadmin') {
        paths.add(item.url);
      }
    }
  }
  return paths;
}

/**
 * Map of legacy AdminDashboard `?tab=` keys → `/admin/<module>` paths.
 * Used by PR3 redirects so old deep links keep working.
 */
export const ADMIN_TAB_TO_PATH: Record<string, string> = {
  users: '/admin/users',
  'registration-invites': '/admin/registration-invites',
  librechat: '/admin/librechat',
  ecoenchants: '/admin/ecoenchants',
  'ecoenchants-ops': '/admin/ecoenchants-ops',
  announcement: '/admin/announcement',
  'markdown-articles': '/admin/markdown-articles',
  env: '/admin/env',
  'mail-system': '/admin/mail-system',
  lottery: '/admin/lottery',
  outemail: '/admin/outemail',
  shortlink: '/admin/shortlink',
  shorturlmigration: '/admin/shorturlmigration',
  command: '/admin/command',
  humancheck: '/admin/humancheck',
  logshare: '/admin/logshare',
  fbiwanted: '/admin/fbiwanted',
  webhookevents: '/admin/webhookevents',
  'bilibili-sync': '/admin/bilibili-sync',
  'data-collection': '/admin/data-collection',
  'crash-reports': '/admin/crash-reports',
  'github-billing-cache': '/admin/github-billing-cache',
  'ip-ban': '/admin/ip-ban',
  fingerprint: '/admin/fingerprint',
  broadcast: '/admin/broadcast',
  oauth: '/admin/oauth',
  apikeys: '/admin/apikeys',
  'apikey-billing': '/admin/apikey-billing',
  'audit-log': '/admin/audit-log',
  'translation-audit': '/admin/translation-audit',
  'tts-history': '/admin/tts-history',
  system: '/admin/system',
  store: '/admin/store',
  resources: '/admin/store/resources',
  cdks: '/admin/store/cdks',
  'email-sender': '/email-sender',
  'nexai-security': '/nexai-security',
  'tamper-detection': '/tamper-detection-demo',
};

/**
 * Mobile overlay root groups — same IA as desktop root, but without the
 * admin-entry chip (admin section is rendered separately).
 */
export function getMobileRootNavGroups(ctx: NavVisibilityContext): NavGroup[] {
  return getRootNavGroups(ctx).filter((g) => g.id !== 'admin-entry');
}

/**
 * Mobile overlay admin section — hub + high-frequency shortcuts only.
 * Full module catalog lives on AdminHub / desktop drill-in; dumping ~35
 * min-h-12 rows into the phone overlay is unusable.
 */
export function getMobileAdminNavGroups(ctx: NavVisibilityContext): NavGroup[] {
  return [
    {
      id: 'admin-mobile',
      title: '管理',
      items: filterByVisibility(
        [
          {
            title: '管理总览',
            url: '/admin',
            icon: FaUserShield as IconType,
            matchChildren: true,
          },
          {
            title: '用户管理',
            url: '/admin/users',
            icon: FaUserShield as IconType,
            requiredRole: 'admin',
          },
          {
            title: '商店管理',
            url: '/admin/store',
            icon: FaStore as IconType,
            matchChildren: true,
          },
          {
            title: '抽奖管理',
            url: '/admin/lottery',
            icon: FaGift as IconType,
            requiredRole: 'superadmin',
          },
          {
            title: '硬币翻转记录',
            url: '/admin/coin-flip',
            icon: FaCoins as IconType,
            requiredRole: 'admin',
          },
          {
            title: '邮件发送',
            url: '/email-sender',
            icon: FaPaperPlane as IconType,
            requiredRole: 'superadmin',
          },
          {
            title: '安全监控',
            url: '/nexai-security',
            icon: FaShieldAlt as IconType,
          },
          {
            title: '系统管理',
            url: '/admin/system',
            icon: FaBars as IconType,
            requiredRole: 'superadmin',
          },
        ],
        ctx,
      ),
    },
  ].filter((g) => g.items.length > 0);
}
