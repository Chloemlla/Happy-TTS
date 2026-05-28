import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { FaRedo, FaSave, FaSync, FaTrash } from 'react-icons/fa';
import { getApiBaseUrl } from '../api/api';
import { SimpleLoadingSpinner } from './LoadingSpinner';
import { useNotification } from './Notification';

const MAIL_SYSTEM_API = `${getApiBaseUrl()}/api/admin/email-system/setting`;

const LOADING_CARD_CLASS =
  'w-full rounded-[36px] border border-white/70 bg-white/88 px-6 py-8 text-center shadow-[0_24px_80px_rgba(15,23,42,0.08)] backdrop-blur-xl';
const LOADING_BADGE_CLASS =
  'mx-auto flex h-14 w-14 items-center justify-center rounded-[26px] bg-slate-100 text-slate-500';
const LOADING_EYEBROW_CLASS =
  'mt-5 text-sm font-semibold uppercase tracking-[0.26em] text-slate-400';

interface MailSystemConfig {
  enabled: boolean;
  resendDomain: string;
  resendApiKey: string;
  quotaTotal: number;
  outemailEnabled: boolean;
  outemailDomain: string;
  outemailApiKey: string;
  outemailCode: string;
  outemailQuotaTotal: number;
}

interface MailSystemSetting {
  config: MailSystemConfig;
  updatedAt?: string;
}

interface ServiceStatus {
  available: boolean;
  error?: string;
  domain?: string;
}

interface MailSystemResponse {
  success: boolean;
  setting?: MailSystemSetting;
  status?: {
    email?: ServiceStatus;
    outemail?: ServiceStatus;
  };
  domains?: string[];
  error?: string;
}

interface MailSystemForm {
  enabled: boolean;
  resendDomain: string;
  quotaTotal: number;
  outemailEnabled: boolean;
  outemailDomain: string;
  outemailQuotaTotal: number;
}

const defaultForm: MailSystemForm = {
  enabled: false,
  resendDomain: '',
  quotaTotal: 100,
  outemailEnabled: false,
  outemailDomain: '',
  outemailQuotaTotal: 100,
};

function getAuthHeaders(): Record<string, string> {
  const token = localStorage.getItem('token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function LoadingCard(props: { eyebrow: string; detail: string }) {
  return (
    <div className={LOADING_CARD_CLASS}>
      <div className={LOADING_BADGE_CLASS}>
        <SimpleLoadingSpinner size={0.75} />
      </div>
      <div className={LOADING_EYEBROW_CLASS}>{props.eyebrow}</div>
      <p className="mt-3 text-sm leading-7 text-slate-600">{props.detail}</p>
    </div>
  );
}

function MailLoadingShell() {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      className="mx-auto flex min-h-[46vh] max-w-3xl items-center justify-center px-4 py-10"
    >
      <LoadingCard eyebrow="Synapse Mail" detail="正在加载后端邮件系统配置..." />
    </div>
  );
}

function StatusPill(props: { label: string; status?: ServiceStatus }) {
  const available = Boolean(props.status?.available);
  return (
    <div className="flex min-w-0 items-center justify-between gap-3 rounded-[22px] border border-white/70 bg-white/88 px-4 py-3 shadow-[0_12px_36px_rgba(15,23,42,0.06)] backdrop-blur-xl">
      <div className="min-w-0">
        <div className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">{props.label}</div>
        <div className="mt-1 truncate text-sm text-slate-600">
          {available ? props.status?.domain || '可用' : props.status?.error || '不可用'}
        </div>
      </div>
      <span
        className={`h-3 w-3 rounded-full ${available ? 'bg-emerald-500 shadow-[0_0_18px_rgba(16,185,129,0.45)]' : 'bg-rose-500 shadow-[0_0_18px_rgba(244,63,94,0.35)]'}`}
        aria-label={available ? '可用' : '不可用'}
      />
    </div>
  );
}

function FieldLabel(props: { label: string; hint?: string }) {
  return (
    <div className="mb-2 flex items-center justify-between gap-3">
      <label className="text-sm font-semibold text-slate-700">{props.label}</label>
      {props.hint ? <span className="text-xs text-slate-400">{props.hint}</span> : null}
    </div>
  );
}

function ToggleField(props: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-4 rounded-[22px] border border-white/70 bg-white/88 px-4 py-3 shadow-[0_12px_36px_rgba(15,23,42,0.06)] backdrop-blur-xl">
      <span className="text-sm font-semibold text-slate-700">{props.label}</span>
      <input
        type="checkbox"
        checked={props.checked}
        onChange={(event) => props.onChange(event.target.checked)}
        className="h-5 w-5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
      />
    </label>
  );
}

function UpdatedAt(props: { value?: string }) {
  return (
    <div className="text-xs font-medium uppercase tracking-[0.2em] text-slate-400">
      Updated {props.value ? new Date(props.value).toLocaleString() : '-'}
    </div>
  );
}

const MailSystemConfigManager: React.FC = () => {
  const { setNotification } = useNotification();
  const [setting, setSetting] = useState<MailSystemSetting | null>(null);
  const [form, setForm] = useState<MailSystemForm>(defaultForm);
  const [resendApiKey, setResendApiKey] = useState('');
  const [outemailApiKey, setOutemailApiKey] = useState('');
  const [outemailCode, setOutemailCode] = useState('');
  const [domains, setDomains] = useState<string[]>([]);
  const [emailStatus, setEmailStatus] = useState<ServiceStatus | undefined>();
  const [outemailStatus, setOutemailStatus] = useState<ServiceStatus | undefined>();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);

  const loadSetting = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(MAIL_SYSTEM_API, { headers: getAuthHeaders() });
      const data = (await response.json().catch(() => null)) as MailSystemResponse | null;
      if (!response.ok || !data?.success) {
        throw new Error(data?.error || '获取邮件系统配置失败');
      }

      const nextSetting = data.setting || null;
      setSetting(nextSetting);
      setEmailStatus(data.status?.email);
      setOutemailStatus(data.status?.outemail);
      setDomains(Array.isArray(data.domains) ? data.domains : []);
      if (nextSetting?.config) {
        setForm({
          enabled: nextSetting.config.enabled,
          resendDomain: nextSetting.config.resendDomain || '',
          quotaTotal: nextSetting.config.quotaTotal || 100,
          outemailEnabled: nextSetting.config.outemailEnabled,
          outemailDomain: nextSetting.config.outemailDomain || '',
          outemailQuotaTotal: nextSetting.config.outemailQuotaTotal || 100,
        });
      }
      setResendApiKey('');
      setOutemailApiKey('');
      setOutemailCode('');
    } catch (error) {
      setNotification({
        message: error instanceof Error ? error.message : '获取邮件系统配置失败',
        type: 'error',
      });
    } finally {
      setLoading(false);
    }
  }, [setNotification]);

  useEffect(() => {
    loadSetting();
  }, [loadSetting]);

  const payload = useMemo(() => {
    const nextPayload: Record<string, unknown> = {
      ...form,
      quotaTotal: Number(form.quotaTotal) || 100,
      outemailQuotaTotal: Number(form.outemailQuotaTotal) || 100,
    };
    if (resendApiKey.trim()) nextPayload.resendApiKey = resendApiKey.trim();
    if (outemailApiKey.trim()) nextPayload.outemailApiKey = outemailApiKey.trim();
    if (outemailCode.trim()) nextPayload.outemailCode = outemailCode.trim();
    return nextPayload;
  }, [form, outemailApiKey, outemailCode, resendApiKey]);

  const saveSetting = useCallback(async () => {
    if (saving) return;
    setSaving(true);
    try {
      const response = await fetch(MAIL_SYSTEM_API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify(payload),
      });
      const data = (await response.json().catch(() => null)) as MailSystemResponse | null;
      if (!response.ok || !data?.success) {
        throw new Error(data?.error || '保存邮件系统配置失败');
      }
      setNotification({ message: '邮件系统配置已保存', type: 'success' });
      await loadSetting();
    } catch (error) {
      setNotification({
        message: error instanceof Error ? error.message : '保存邮件系统配置失败',
        type: 'error',
      });
    } finally {
      setSaving(false);
    }
  }, [loadSetting, payload, saving, setNotification]);

  const resetSetting = useCallback(async () => {
    if (resetting) return;
    const confirmed = window.confirm('确定要重置邮件系统配置为环境变量默认值吗？');
    if (!confirmed) return;

    setResetting(true);
    try {
      const response = await fetch(MAIL_SYSTEM_API, {
        method: 'DELETE',
        headers: getAuthHeaders(),
      });
      const data = (await response.json().catch(() => null)) as MailSystemResponse | null;
      if (!response.ok || !data?.success) {
        throw new Error(data?.error || '重置邮件系统配置失败');
      }
      setNotification({ message: '邮件系统配置已重置', type: 'success' });
      await loadSetting();
    } catch (error) {
      setNotification({
        message: error instanceof Error ? error.message : '重置邮件系统配置失败',
        type: 'error',
      });
    } finally {
      setResetting(false);
    }
  }, [loadSetting, resetting, setNotification]);

  if (loading) {
    return <MailLoadingShell />;
  }

  return (
    <div className="relative overflow-hidden rounded-[36px] border border-white/70 bg-[radial-gradient(circle_at_top,_rgba(59,130,246,0.22),_transparent_34%),linear-gradient(180deg,#f8fbff_0%,#eef2ff_55%,#f8fafc_100%)] p-4 shadow-[0_24px_80px_rgba(15,23,42,0.08)] sm:p-6">
      <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(255,255,255,0.3)_0%,transparent_52%)]" />
      <div className="relative space-y-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-400">Synapse Runtime</div>
            <h2 className="mt-3 text-2xl font-semibold text-slate-900 sm:text-3xl">后端邮件系统配置</h2>
            <div className="mt-3">
              <UpdatedAt value={setting?.updatedAt} />
            </div>
          </div>
          <div className="flex flex-wrap gap-3">
            <motion.button
              type="button"
              onClick={loadSetting}
              disabled={loading || saving || resetting}
              className="inline-flex items-center gap-2 rounded-[18px] border border-white/70 bg-white/88 px-4 py-2 text-sm font-semibold text-slate-700 shadow-[0_8px_24px_rgba(15,23,42,0.08)] backdrop-blur-xl transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
              whileTap={{ scale: 0.97 }}
            >
              <FaSync className={loading ? 'animate-spin' : ''} />
              刷新
            </motion.button>
            <motion.button
              type="button"
              onClick={resetSetting}
              disabled={saving || resetting}
              className="inline-flex items-center gap-2 rounded-[18px] bg-rose-600 px-4 py-2 text-sm font-semibold text-white shadow-[0_12px_32px_rgba(225,29,72,0.22)] transition hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-60"
              whileTap={{ scale: 0.97 }}
            >
              {resetting ? <FaRedo className="animate-spin" /> : <FaTrash />}
              重置
            </motion.button>
            <motion.button
              type="button"
              onClick={saveSetting}
              disabled={saving || resetting}
              className="inline-flex items-center gap-2 rounded-[18px] bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-[0_12px_32px_rgba(15,23,42,0.2)] transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
              whileTap={{ scale: 0.97 }}
            >
              {saving ? <FaRedo className="animate-spin" /> : <FaSave />}
              保存
            </motion.button>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          <StatusPill label="Mail Service" status={emailStatus} />
          <StatusPill label="OutEmail" status={outemailStatus} />
          <div className="rounded-[22px] border border-white/70 bg-white/88 px-4 py-3 shadow-[0_12px_36px_rgba(15,23,42,0.06)] backdrop-blur-xl">
            <div className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">Domains</div>
            <div className="mt-1 truncate text-sm text-slate-600">{domains.length ? domains.join(', ') : '-'}</div>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <section className="rounded-[28px] border border-white/70 bg-white/88 p-5 shadow-[0_18px_52px_rgba(15,23,42,0.07)] backdrop-blur-xl">
            <div className="mb-5 flex items-center justify-between gap-4">
              <div>
                <h3 className="text-lg font-semibold text-slate-900">主邮件服务</h3>
                <p className="mt-1 text-sm leading-6 text-slate-500">账号验证、密码重置、系统通知使用此配置。</p>
              </div>
            </div>

            <div className="space-y-4">
              <ToggleField
                label="启用主邮件服务"
                checked={form.enabled}
                onChange={(checked) => setForm((prev) => ({ ...prev, enabled: checked }))}
              />
              <div>
                <FieldLabel label="Resend 发信域名" />
                <input
                  value={form.resendDomain}
                  onChange={(event) => setForm((prev) => ({ ...prev, resendDomain: event.target.value }))}
                  placeholder="example.com"
                  className="w-full rounded-[18px] border border-slate-200 bg-white/90 px-4 py-3 text-sm text-slate-800 shadow-inner outline-none transition focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100"
                />
              </div>
              <div>
                <FieldLabel label="Resend API Key" hint={setting?.config.resendApiKey || '未配置'} />
                <input
                  type="password"
                  value={resendApiKey}
                  onChange={(event) => setResendApiKey(event.target.value)}
                  placeholder="留空表示保留现有 API Key"
                  className="w-full rounded-[18px] border border-slate-200 bg-white/90 px-4 py-3 text-sm text-slate-800 shadow-inner outline-none transition focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100"
                />
              </div>
              <div>
                <FieldLabel label="每日配额" />
                <input
                  type="number"
                  min={1}
                  value={form.quotaTotal}
                  onChange={(event) => setForm((prev) => ({ ...prev, quotaTotal: Number(event.target.value) || 1 }))}
                  className="w-full rounded-[18px] border border-slate-200 bg-white/90 px-4 py-3 text-sm text-slate-800 shadow-inner outline-none transition focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100"
                />
              </div>
            </div>
          </section>

          <section className="rounded-[28px] border border-white/70 bg-white/88 p-5 shadow-[0_18px_52px_rgba(15,23,42,0.07)] backdrop-blur-xl">
            <div className="mb-5 flex items-center justify-between gap-4">
              <div>
                <h3 className="text-lg font-semibold text-slate-900">对外邮件服务</h3>
                <p className="mt-1 text-sm leading-6 text-slate-500">公共外部发信接口、验证码和外部发信配额使用此配置。</p>
              </div>
            </div>

            <div className="space-y-4">
              <ToggleField
                label="启用对外邮件服务"
                checked={form.outemailEnabled}
                onChange={(checked) => setForm((prev) => ({ ...prev, outemailEnabled: checked }))}
              />
              <div>
                <FieldLabel label="对外发信域名" />
                <input
                  value={form.outemailDomain}
                  onChange={(event) => setForm((prev) => ({ ...prev, outemailDomain: event.target.value }))}
                  placeholder="example.com"
                  className="w-full rounded-[18px] border border-slate-200 bg-white/90 px-4 py-3 text-sm text-slate-800 shadow-inner outline-none transition focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100"
                />
              </div>
              <div>
                <FieldLabel label="对外 Resend API Key" hint={setting?.config.outemailApiKey || '未配置'} />
                <input
                  type="password"
                  value={outemailApiKey}
                  onChange={(event) => setOutemailApiKey(event.target.value)}
                  placeholder="留空表示保留现有 API Key"
                  className="w-full rounded-[18px] border border-slate-200 bg-white/90 px-4 py-3 text-sm text-slate-800 shadow-inner outline-none transition focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100"
                />
              </div>
              <div>
                <FieldLabel label="默认校验码" hint={setting?.config.outemailCode || '未配置'} />
                <input
                  type="password"
                  value={outemailCode}
                  onChange={(event) => setOutemailCode(event.target.value)}
                  placeholder="留空表示保留现有校验码"
                  className="w-full rounded-[18px] border border-slate-200 bg-white/90 px-4 py-3 text-sm text-slate-800 shadow-inner outline-none transition focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100"
                />
              </div>
              <div>
                <FieldLabel label="对外每日配额" />
                <input
                  type="number"
                  min={1}
                  value={form.outemailQuotaTotal}
                  onChange={(event) => setForm((prev) => ({ ...prev, outemailQuotaTotal: Number(event.target.value) || 1 }))}
                  className="w-full rounded-[18px] border border-slate-200 bg-white/90 px-4 py-3 text-sm text-slate-800 shadow-inner outline-none transition focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100"
                />
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
};

export default MailSystemConfigManager;
