import React, { useCallback, useEffect, useState } from 'react';
import {
  FaCheck,
  FaCopy,
  FaExclamationTriangle,
  FaKey,
  FaLink,
  FaShieldAlt,
  FaSyncAlt,
} from 'react-icons/fa';
import {
  oauthApi,
  type OAuthJwks,
  type OAuthOpenidConfiguration,
} from '../api/oauth';
import { useNotification } from './Notification';

const DISCOVERY_PATH = '/.well-known/openid-configuration';
const LIBRECHAT_CALLBACK_PATH = '/oauth/openid/callback';
const LIBRECHAT_ADMIN_CALLBACK_PATH = '/api/admin/oauth/openid/callback';

interface EndpointRow {
  label: string;
  hint: string;
  value: string;
}

const buildEndpointRows = (config: OAuthOpenidConfiguration): EndpointRow[] => [
  { label: '授权端点', hint: '浏览器跳转到同意页', value: config.authorization_endpoint },
  { label: 'Token 端点', hint: '换取 access_token 与 id_token', value: config.token_endpoint },
  { label: 'UserInfo 端点', hint: '需携带 access_token', value: config.userinfo_endpoint },
  { label: 'JWKS', hint: 'id_token 验签公钥', value: config.jwks_uri },
  { label: 'Introspect 端点', hint: 'token 状态查询', value: config.introspection_endpoint },
  { label: 'Revoke 端点', hint: '撤销 token', value: config.revocation_endpoint },
];

const buildLibreChatSnippet = (issuer: string): string =>
  [
    '# LibreChat 以本服务作为 OIDC 提供方',
    `OPENID_ISSUER=${issuer}`,
    'OPENID_CLIENT_ID=<在下方创建客户端后获得>',
    'OPENID_CLIENT_SECRET=<仅创建时显示一次，请立即保存>',
    'OPENID_SCOPE=openid profile email',
    `OPENID_CALLBACK_URL=${LIBRECHAT_CALLBACK_PATH}`,
    'OPENID_SESSION_SECRET=<随机长字符串>',
    'OPENID_BUTTON_LABEL=使用 Synapse 登录',
    '# 角色映射：本服务 role=admin 的用户映射为 LibreChat ADMIN',
    'OPENID_ADMIN_ROLE=admin',
    'OPENID_ADMIN_ROLE_PARAMETER_PATH=role',
    '# 只接受 access / id / userinfo，写成 id_token 会导致每次登录失败',
    'OPENID_ADMIN_ROLE_TOKEN_KIND=id',
    'ALLOW_SOCIAL_LOGIN=true',
  ].join('\n');

const OAuthOidcEndpointPanel: React.FC = () => {
  const { setNotification } = useNotification();
  const [config, setConfig] = useState<OAuthOpenidConfiguration | null>(null);
  const [jwks, setJwks] = useState<OAuthJwks | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const nextConfig = await oauthApi.getOpenidConfiguration();
      setConfig(nextConfig);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'OIDC 发现文档获取失败');
      setConfig(null);
      setJwks(null);
      setLoading(false);
      return;
    }
    try {
      setJwks(await oauthApi.getJwks());
    } catch {
      setJwks(null);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const copy = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setNotification({ message: '已复制到剪贴板', type: 'success' });
    } catch {
      setNotification({ message: '复制失败', type: 'error' });
    }
  };

  const discoveryUrl = config ? `${config.issuer}${DISCOVERY_PATH}` : null;
  const signingKey = jwks?.keys?.[0] ?? null;

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
          <FaLink /> OIDC 接入信息
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
        >
          <FaSyncAlt className={loading ? 'animate-spin' : ''} /> 重新探测
        </button>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-800">
          <FaExclamationTriangle className="mt-0.5 shrink-0" />
          <span className="break-all">发现文档获取失败：{error}</span>
        </div>
      )}

      {loading && !config && (
        <p className="text-xs text-slate-500">正在读取发现文档…</p>
      )}

      {config && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 font-semibold text-emerald-700">
              <FaCheck /> 发现文档可用
            </span>
            <span
              className={
                signingKey
                  ? 'inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 font-semibold text-emerald-700'
                  : 'inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-1 font-semibold text-amber-700'
              }
            >
              <FaKey />
              {signingKey
                ? `id_token 签名就绪 · kid ${signingKey.kid.slice(0, 12)}…`
                : 'id_token 签名密钥尚未生成'}
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 font-semibold text-slate-700">
              <FaShieldAlt />
              {config.id_token_signing_alg_values_supported.join(' / ') || '未声明签名算法'}
            </span>
          </div>

          <div>
            <div className="text-xs font-semibold text-slate-900">发现文档地址（下游填这个）</div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <code className="min-w-0 flex-1 break-all rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-800">
                {discoveryUrl}
              </code>
              <button
                type="button"
                onClick={() => copy(discoveryUrl ?? '')}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                <FaCopy /> 复制
              </button>
            </div>
            <p className="mt-2 text-xs text-slate-500">
              issuer 为 {config.issuer}，按 RFC 8414 发现文档必须落在
              {' '}
              <code className="break-all">{discoveryUrl}</code>
              {' '}
              （另有兼容别名 <code className="break-all">/api/oauth/.well-known/openid-configuration</code>）。
              下游会逐字符校验 issuer 与取文档的地址是否一致，填错即拒绝启动。
            </p>
          </div>

          <div className="overflow-hidden rounded-lg border border-slate-200">
            {buildEndpointRows(config).map((row, index) => (
              <div
                key={row.label}
                className={
                  index === 0
                    ? 'flex flex-wrap items-center gap-3 px-3 py-2'
                    : 'flex flex-wrap items-center gap-3 border-t border-slate-100 px-3 py-2'
                }
              >
                <div className="w-28 shrink-0">
                  <div className="text-xs font-semibold text-slate-900">{row.label}</div>
                  <div className="text-[11px] text-slate-500">{row.hint}</div>
                </div>
                <code className="min-w-0 flex-1 break-all text-xs text-slate-700">{row.value}</code>
                <button
                  type="button"
                  onClick={() => copy(row.value)}
                  aria-label={`复制${row.label}`}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  <FaCopy />
                </button>
              </div>
            ))}
          </div>

          <div>
            <div className="text-xs font-semibold text-slate-900">下游回调地址</div>
            <ul className="mt-2 space-y-1 text-xs text-slate-600">
              <li>
                LibreChat 登录：<code className="break-all">{LIBRECHAT_CALLBACK_PATH}</code>
                （拼在下游自己的域名之后，需与本服务客户端登记的回调地址逐字符一致）
              </li>
              <li>
                若下游还用了管理面板 SSO，另需登记
                {' '}
                <code className="break-all">{LIBRECHAT_ADMIN_CALLBACK_PATH}</code>
              </li>
            </ul>
          </div>

          <div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-xs font-semibold text-slate-900">LibreChat 配置片段</div>
              <button
                type="button"
                onClick={() => copy(buildLibreChatSnippet(config.issuer))}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                <FaCopy /> 复制片段
              </button>
            </div>
            <pre className="mt-2 overflow-x-auto rounded-lg bg-slate-900 px-3 py-3 text-[11px] leading-5 text-slate-100">
              {buildLibreChatSnippet(config.issuer)}
            </pre>
          </div>

          <div className="space-y-2 text-xs text-slate-600">
            <div>
              <span className="font-semibold text-slate-900">支持的 scope：</span>
              <span className="break-all">{config.scopes_supported.join('、')}</span>
              {' '}
              —— 登录场景至少需要 <code>openid profile email</code>，缺少 <code>openid</code> 时不会签发 id_token。
            </div>
            <div>
              <span className="font-semibold text-slate-900">id_token 声明的 claim：</span>
              <span className="break-all">{config.claims_supported.join('、')}</span>
            </div>
            <div>
              <span className="font-semibold text-slate-900">授权方式：</span>
              <span className="break-all">{config.grant_types_supported.join('、')}</span>
              {' · '}
              <span className="break-all">{config.code_challenge_methods_supported.join('、')}</span>
              {' · '}
              <span className="break-all">{config.token_endpoint_auth_methods_supported.join('、')}</span>
            </div>
          </div>
        </div>
      )}
    </section>
  );
};

export default OAuthOidcEndpointPanel;
