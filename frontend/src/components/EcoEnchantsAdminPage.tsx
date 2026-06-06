import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  FaBan,
  FaClipboardList,
  FaCloudUploadAlt,
  FaExclamationTriangle,
  FaFingerprint,
  FaKey,
  FaLayerGroup,
  FaPlus,
  FaRedo,
  FaShieldAlt,
  FaStream,
} from 'react-icons/fa';
import type { IconType } from 'react-icons';
import api from '../api/api';
import { useNotification } from './Notification';
import {
  InfoBadge,
  InfoMetricCard,
  InfoPanel,
  InfoPrimaryButton,
  InfoQueryHero,
  InfoSectionTitle,
  logShareDangerButtonClass,
  logShareInputClass,
  logShareSecondaryButtonClass,
  logShareTileClass,
} from './LogShareStyleScaffold';

type LicenseStatus = 'valid' | 'trial' | 'expired' | 'suspended' | 'revoked';

interface EcoProductPolicy {
  requestId: string;
  productId: string;
  latestVersion: string;
  minimumSupportedVersion: string;
  recommendedJava: number;
  supportedPlatforms: string[];
  notices: string[];
}

interface EcoHealth {
  requestId: string;
  status: string;
  time: string;
}

interface EcoAuditLog {
  auditId: string;
  actorType: string;
  actorId: string;
  action: string;
  targetType?: string;
  targetId?: string;
  result: 'success' | 'failure';
  createdAt: string;
}

interface EcoRiskEvent {
  riskEventId: string;
  licenseId?: string;
  activationId?: string;
  type: string;
  severity: 'low' | 'medium' | 'high';
  status: string;
  message: string;
  createdAt: string;
}

interface CreatedLicense {
  licenseId: string;
  licenseKey: string;
  key: string;
  status: LicenseStatus;
}

const PRODUCT_ID = 'ecoenchants';
const statusOptions: LicenseStatus[] = ['valid', 'trial', 'expired', 'suspended', 'revoked'];
const inputClass = `${logShareInputClass} py-2.5`;
const labelClass = 'text-xs font-semibold uppercase tracking-[0.18em] text-slate-500';

const makeIdempotencyKey = (scope: string): string => {
  const randomId = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${scope}-${randomId}`;
};

const splitList = (value: string): string[] =>
  value
    .split(',')
    .map(item => item.trim())
    .filter(Boolean);

const optionalNumber = (value: string): number | undefined => {
  if (!value.trim()) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const optionalText = (value: string): string | undefined => {
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
};

const getErrorMessage = (error: unknown, fallback: string): string => {
  const anyError = error as any;
  if (getErrorCode(error) === 'mfa_required') {
    return 'EcoEnchants 管理需要先启用双因素验证';
  }
  return anyError?.response?.data?.error?.message || anyError?.response?.data?.message || anyError?.message || fallback;
};

const getErrorCode = (error: unknown): string | undefined => {
  const data = (error as any)?.response?.data;
  const nestedError = data?.error;
  if (typeof nestedError === 'string') return nestedError;
  return nestedError?.code || data?.code || data?.errorCode;
};

const isMfaRequiredError = (error: unknown): boolean => getErrorCode(error) === 'mfa_required';

const Field: React.FC<{
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
  required?: boolean;
}> = ({ label, value, onChange, placeholder, type = 'text', required }) => (
  <label className="block space-y-2">
    <span className={labelClass}>{label}</span>
    <input
      className={inputClass}
      type={type}
      value={value}
      onChange={event => onChange(event.target.value)}
      placeholder={placeholder}
      required={required}
    />
  </label>
);

const TextAreaField: React.FC<{
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  rows?: number;
  required?: boolean;
}> = ({ label, value, onChange, placeholder, rows = 3, required }) => (
  <label className="block space-y-2">
    <span className={labelClass}>{label}</span>
    <textarea
      className={inputClass}
      rows={rows}
      value={value}
      onChange={event => onChange(event.target.value)}
      placeholder={placeholder}
      required={required}
    />
  </label>
);

const SelectField: React.FC<{
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ label: string; value: string }>;
}> = ({ label, value, onChange, options }) => (
  <label className="block space-y-2">
    <span className={labelClass}>{label}</span>
    <select className={inputClass} value={value} onChange={event => onChange(event.target.value)}>
      {options.map(option => (
        <option key={option.value} value={option.value}>{option.label}</option>
      ))}
    </select>
  </label>
);

const SectionShell: React.FC<{
  title: string;
  description: string;
  icon: IconType;
  children: React.ReactNode;
  action?: React.ReactNode;
}> = ({ title, description, icon, children, action }) => (
  <InfoPanel>
    <InfoSectionTitle title={title} description={description} icon={icon} action={action} />
    {children}
  </InfoPanel>
);

const EcoEnchantsAdminPage: React.FC = () => {
  const { setNotification } = useNotification();
  const [health, setHealth] = useState<EcoHealth | null>(null);
  const [policy, setPolicy] = useState<EcoProductPolicy | null>(null);
  const [auditLogs, setAuditLogs] = useState<EcoAuditLog[]>([]);
  const [riskEvents, setRiskEvents] = useState<EcoRiskEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState<string | null>(null);
  const [createdLicense, setCreatedLicense] = useState<CreatedLicense | null>(null);
  const [mfaRequired, setMfaRequired] = useState(false);

  const [productForm, setProductForm] = useState({
    productId: PRODUCT_ID,
    name: 'EcoEnchants',
    latestVersion: '13.0.0',
    minimumSupportedVersion: '12.5.0',
    recommendedJava: '21',
    supportedPlatforms: 'Paper,Folia',
    notices: '',
  });
  const [planForm, setPlanForm] = useState({
    productId: PRODUCT_ID,
    planId: 'pro',
    name: 'Pro',
    maxActivations: '3',
    durationDays: '365',
    priceCents: '',
    currency: 'USD',
    features: '',
  });
  const [releaseForm, setReleaseForm] = useState({
    productId: PRODUCT_ID,
    version: '13.0.0',
    channel: 'stable',
    sha256: '',
    signature: '',
    fileName: 'EcoEnchants-13.0.0.jar',
    downloadUrl: '',
  });
  const [licenseForm, setLicenseForm] = useState({
    productId: PRODUCT_ID,
    customerId: '',
    planId: 'pro',
    status: 'valid' as LicenseStatus,
    maxActivations: '3',
    expiresAt: '',
  });
  const [licenseUpdateForm, setLicenseUpdateForm] = useState({
    licenseId: '',
    status: 'valid' as LicenseStatus,
    maxActivations: '',
    expiresAt: '',
    planId: '',
    customerId: '',
  });
  const [revokeLicenseId, setRevokeLicenseId] = useState('');

  const statusTone = useMemo(() => {
    if (!health) return 'slate' as const;
    return health.status === 'ok' ? 'emerald' as const : 'rose' as const;
  }, [health]);

  const loadOverview = useCallback(async () => {
    setLoading(true);
    try {
      const [healthRes, policyRes, auditRes, riskRes] = await Promise.allSettled([
        api.get<EcoHealth>('/api/ecoenchants/v1/health'),
        api.get<EcoProductPolicy>('/api/ecoenchants/v1/products/ecoenchants/policy'),
        api.get<{ logs: EcoAuditLog[] }>('/api/ecoenchants/v1/admin/audit-logs?page=1&pageSize=8'),
        api.get<{ riskEvents: EcoRiskEvent[] }>('/api/ecoenchants/v1/admin/risk-events?page=1&pageSize=8'),
      ]);

      if (healthRes.status === 'fulfilled') setHealth(healthRes.value.data);
      if (policyRes.status === 'fulfilled') setPolicy(policyRes.value.data);

      const adminFailures = [auditRes, riskRes].filter(
        (result): result is PromiseRejectedResult => result.status === 'rejected',
      );
      if (adminFailures.some(result => isMfaRequiredError(result.reason))) {
        setMfaRequired(true);
        setAuditLogs([]);
        setRiskEvents([]);
        return;
      }

      const firstFailure = [healthRes, policyRes, auditRes, riskRes].find(
        (result): result is PromiseRejectedResult => result.status === 'rejected',
      );
      if (firstFailure) throw firstFailure.reason;

      setMfaRequired(false);
      setAuditLogs(auditRes.value.data.logs || []);
      setRiskEvents(riskRes.value.data.riskEvents || []);
    } catch (error) {
      setNotification({ message: getErrorMessage(error, '加载 EcoEnchants 管理数据失败'), type: 'error' });
    } finally {
      setLoading(false);
    }
  }, [setNotification]);

  useEffect(() => {
    loadOverview();
  }, [loadOverview]);

  const runSubmit = async (scope: string, action: () => Promise<void>, successMessage: string) => {
    setSubmitting(scope);
    try {
      await action();
      setNotification({ message: successMessage, type: 'success' });
      await loadOverview();
    } catch (error) {
      if (isMfaRequiredError(error)) setMfaRequired(true);
      setNotification({ message: getErrorMessage(error, `${successMessage}失败`), type: 'error' });
    } finally {
      setSubmitting(null);
    }
  };

  const createProduct = async (event: React.FormEvent) => {
    event.preventDefault();
    await runSubmit('product', async () => {
      await api.post('/api/ecoenchants/v1/admin/products', {
        productId: productForm.productId.trim(),
        name: productForm.name.trim(),
        latestVersion: productForm.latestVersion.trim(),
        minimumSupportedVersion: productForm.minimumSupportedVersion.trim(),
        recommendedJava: Number(productForm.recommendedJava || 21),
        supportedPlatforms: splitList(productForm.supportedPlatforms),
        notices: splitList(productForm.notices),
        isActive: true,
      }, { headers: { 'Idempotency-Key': makeIdempotencyKey('admin-products-create') } });
    }, '产品策略已创建');
  };

  const createPlan = async (event: React.FormEvent) => {
    event.preventDefault();
    await runSubmit('plan', async () => {
      await api.post('/api/ecoenchants/v1/admin/plans', {
        productId: planForm.productId.trim(),
        planId: planForm.planId.trim(),
        name: planForm.name.trim(),
        maxActivations: Number(planForm.maxActivations || 1),
        durationDays: optionalNumber(planForm.durationDays),
        priceCents: optionalNumber(planForm.priceCents),
        currency: planForm.currency.trim().toUpperCase(),
        features: splitList(planForm.features),
        isActive: true,
      }, { headers: { 'Idempotency-Key': makeIdempotencyKey('admin-plans-create') } });
    }, '授权套餐已创建');
  };

  const createRelease = async (event: React.FormEvent) => {
    event.preventDefault();
    await runSubmit('release', async () => {
      await api.post(`/api/ecoenchants/v1/admin/products/${encodeURIComponent(releaseForm.productId.trim())}/versions`, {
        version: releaseForm.version.trim(),
        channel: releaseForm.channel.trim(),
        sha256: releaseForm.sha256.trim(),
        signature: releaseForm.signature.trim(),
        fileName: releaseForm.fileName.trim(),
        downloadUrl: releaseForm.downloadUrl.trim(),
        isActive: true,
      }, { headers: { 'Idempotency-Key': makeIdempotencyKey('admin-release-create') } });
    }, '发布版本已登记');
  };

  const createLicense = async (event: React.FormEvent) => {
    event.preventDefault();
    await runSubmit('license', async () => {
      const response = await api.post<{
        license: { licenseId: string; key: string; status: LicenseStatus };
        licenseKey: string;
      }>('/api/ecoenchants/v1/admin/licenses', {
        productId: licenseForm.productId.trim(),
        customerId: licenseForm.customerId.trim(),
        planId: licenseForm.planId.trim(),
        status: licenseForm.status,
        maxActivations: Number(licenseForm.maxActivations || 1),
        expiresAt: optionalText(licenseForm.expiresAt),
      }, { headers: { 'Idempotency-Key': makeIdempotencyKey('admin-licenses-create') } });
      setCreatedLicense({
        licenseId: response.data.license.licenseId,
        licenseKey: response.data.licenseKey,
        key: response.data.license.key,
        status: response.data.license.status,
      });
    }, '授权已创建');
  };

  const updateLicense = async (event: React.FormEvent) => {
    event.preventDefault();
    await runSubmit('license-update', async () => {
      const body: Record<string, unknown> = { status: licenseUpdateForm.status };
      const maxActivations = optionalNumber(licenseUpdateForm.maxActivations);
      if (maxActivations !== undefined) body.maxActivations = maxActivations;
      if (optionalText(licenseUpdateForm.expiresAt)) body.expiresAt = licenseUpdateForm.expiresAt.trim();
      if (optionalText(licenseUpdateForm.planId)) body.planId = licenseUpdateForm.planId.trim();
      if (optionalText(licenseUpdateForm.customerId)) body.customerId = licenseUpdateForm.customerId.trim();
      await api.patch(
        `/api/ecoenchants/v1/admin/licenses/${encodeURIComponent(licenseUpdateForm.licenseId.trim())}`,
        body,
        { headers: { 'Idempotency-Key': makeIdempotencyKey('admin-licenses-update') } },
      );
    }, '授权状态已更新');
  };

  const revokeLicense = async (event: React.FormEvent) => {
    event.preventDefault();
    await runSubmit('license-revoke', async () => {
      await api.post(
        `/api/ecoenchants/v1/admin/licenses/${encodeURIComponent(revokeLicenseId.trim())}/revoke`,
        {},
        { headers: { 'Idempotency-Key': makeIdempotencyKey('admin-licenses-revoke') } },
      );
    }, '授权已吊销');
  };

  return (
    <div className="space-y-6">
      <InfoQueryHero
        eyebrow="EcoEnchants"
        title="商业授权管理"
        description="在线授权、构建指纹、发布版本和审计事件的后台操作台。"
        icon={FaShieldAlt}
        tone="emerald"
        meta={(
          <>
            <InfoBadge tone={statusTone}>授权服务 {health?.status || 'unknown'}</InfoBadge>
            <InfoBadge tone="slate">产品 {policy?.productId || PRODUCT_ID}</InfoBadge>
            <InfoBadge tone="slate">最新 {policy?.latestVersion || '-'}</InfoBadge>
          </>
        )}
        actions={(
          <button type="button" className={logShareSecondaryButtonClass} onClick={loadOverview} disabled={loading}>
            <FaRedo className={loading ? 'animate-spin' : ''} />
            刷新
          </button>
        )}
      />

      {mfaRequired && (
        <InfoPanel>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-amber-100 text-amber-700">
                <FaShieldAlt />
              </div>
              <div>
                <h2 className="text-base font-semibold text-slate-900">需要双因素验证</h2>
                <p className="mt-1 text-sm leading-6 text-slate-600">
                  生产环境的 EcoEnchants 管理操作要求管理员账号启用 TOTP 或 Passkey。
                </p>
              </div>
            </div>
            <button type="button" className={logShareSecondaryButtonClass} onClick={loadOverview} disabled={loading}>
              <FaRedo className={loading ? 'animate-spin' : ''} />
              重新检查
            </button>
          </div>
        </InfoPanel>
      )}

      {!mfaRequired && (
        <>
      <div className="grid gap-4 md:grid-cols-3">
        <InfoMetricCard
          label="最低支持版本"
          value={policy?.minimumSupportedVersion || '-'}
          detail={`推荐 Java ${policy?.recommendedJava || 21}`}
          icon={FaLayerGroup}
        />
        <InfoMetricCard
          label="支持平台"
          value={policy?.supportedPlatforms?.join(' / ') || '-'}
          detail="来自产品策略接口"
          icon={FaCloudUploadAlt}
        />
        <InfoMetricCard
          label="风控事件"
          value={riskEvents.length}
          detail="最近查询窗口"
          icon={FaExclamationTriangle}
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <SectionShell title="产品策略" description="创建 EcoEnchants 产品记录，作为策略和发布版本的根对象。" icon={FaLayerGroup}>
          <form className="grid gap-4 md:grid-cols-2" onSubmit={createProduct}>
            <Field label="Product ID" value={productForm.productId} onChange={value => setProductForm(prev => ({ ...prev, productId: value }))} required />
            <Field label="产品名称" value={productForm.name} onChange={value => setProductForm(prev => ({ ...prev, name: value }))} required />
            <Field label="最新版本" value={productForm.latestVersion} onChange={value => setProductForm(prev => ({ ...prev, latestVersion: value }))} />
            <Field label="最低支持版本" value={productForm.minimumSupportedVersion} onChange={value => setProductForm(prev => ({ ...prev, minimumSupportedVersion: value }))} />
            <Field label="推荐 Java" type="number" value={productForm.recommendedJava} onChange={value => setProductForm(prev => ({ ...prev, recommendedJava: value }))} />
            <Field label="支持平台" value={productForm.supportedPlatforms} onChange={value => setProductForm(prev => ({ ...prev, supportedPlatforms: value }))} placeholder="Paper,Folia" />
            <div className="md:col-span-2">
              <TextAreaField label="公告" value={productForm.notices} onChange={value => setProductForm(prev => ({ ...prev, notices: value }))} placeholder="逗号分隔" />
            </div>
            <div className="md:col-span-2">
              <InfoPrimaryButton type="submit" disabled={submitting === 'product'}>
                <FaPlus />
                {submitting === 'product' ? '提交中...' : '创建产品'}
              </InfoPrimaryButton>
            </div>
          </form>
        </SectionShell>

        <SectionShell title="授权套餐" description="创建面向客户的套餐，控制默认席位、期限和价格字段。" icon={FaClipboardList}>
          <form className="grid gap-4 md:grid-cols-2" onSubmit={createPlan}>
            <Field label="Product ID" value={planForm.productId} onChange={value => setPlanForm(prev => ({ ...prev, productId: value }))} required />
            <Field label="Plan ID" value={planForm.planId} onChange={value => setPlanForm(prev => ({ ...prev, planId: value }))} required />
            <Field label="套餐名称" value={planForm.name} onChange={value => setPlanForm(prev => ({ ...prev, name: value }))} required />
            <Field label="最大激活数" type="number" value={planForm.maxActivations} onChange={value => setPlanForm(prev => ({ ...prev, maxActivations: value }))} />
            <Field label="有效天数" type="number" value={planForm.durationDays} onChange={value => setPlanForm(prev => ({ ...prev, durationDays: value }))} />
            <Field label="价格分" type="number" value={planForm.priceCents} onChange={value => setPlanForm(prev => ({ ...prev, priceCents: value }))} />
            <Field label="币种" value={planForm.currency} onChange={value => setPlanForm(prev => ({ ...prev, currency: value }))} />
            <Field label="特性" value={planForm.features} onChange={value => setPlanForm(prev => ({ ...prev, features: value }))} placeholder="逗号分隔" />
            <div className="md:col-span-2">
              <InfoPrimaryButton type="submit" disabled={submitting === 'plan'}>
                <FaPlus />
                {submitting === 'plan' ? '提交中...' : '创建套餐'}
              </InfoPrimaryButton>
            </div>
          </form>
        </SectionShell>
      </div>

      <SectionShell title="发布版本与构建指纹" description="登记官方 JAR 的 sha256、签名和短期下载源，用于授权校验与下载接口。" icon={FaFingerprint}>
        <form className="grid gap-4 md:grid-cols-2 xl:grid-cols-3" onSubmit={createRelease}>
          <Field label="Product ID" value={releaseForm.productId} onChange={value => setReleaseForm(prev => ({ ...prev, productId: value }))} required />
          <Field label="版本" value={releaseForm.version} onChange={value => setReleaseForm(prev => ({ ...prev, version: value, fileName: `EcoEnchants-${value}.jar` }))} required />
          <Field label="通道" value={releaseForm.channel} onChange={value => setReleaseForm(prev => ({ ...prev, channel: value }))} required />
          <div className="md:col-span-2 xl:col-span-3">
            <Field label="SHA-256" value={releaseForm.sha256} onChange={value => setReleaseForm(prev => ({ ...prev, sha256: value }))} placeholder="64 位十六进制摘要" required />
          </div>
          <Field label="文件名" value={releaseForm.fileName} onChange={value => setReleaseForm(prev => ({ ...prev, fileName: value }))} required />
          <div className="md:col-span-2">
            <Field label="下载 URL" value={releaseForm.downloadUrl} onChange={value => setReleaseForm(prev => ({ ...prev, downloadUrl: value }))} required />
          </div>
          <div className="md:col-span-2 xl:col-span-3">
            <TextAreaField label="签名" value={releaseForm.signature} onChange={value => setReleaseForm(prev => ({ ...prev, signature: value }))} rows={4} required />
          </div>
          <div className="md:col-span-2 xl:col-span-3">
            <InfoPrimaryButton type="submit" disabled={submitting === 'release'}>
              <FaCloudUploadAlt />
              {submitting === 'release' ? '提交中...' : '登记发布版本'}
            </InfoPrimaryButton>
          </div>
        </form>
      </SectionShell>

      <div className="grid gap-6 xl:grid-cols-2">
        <SectionShell title="创建授权" description="生成授权码并写入哈希，明文授权码只在本次响应中返回。" icon={FaKey}>
          <form className="grid gap-4 md:grid-cols-2" onSubmit={createLicense}>
            <Field label="Customer ID" value={licenseForm.customerId} onChange={value => setLicenseForm(prev => ({ ...prev, customerId: value }))} required />
            <Field label="Plan ID" value={licenseForm.planId} onChange={value => setLicenseForm(prev => ({ ...prev, planId: value }))} required />
            <SelectField label="状态" value={licenseForm.status} onChange={value => setLicenseForm(prev => ({ ...prev, status: value as LicenseStatus }))} options={statusOptions.map(value => ({ label: value, value }))} />
            <Field label="最大激活数" type="number" value={licenseForm.maxActivations} onChange={value => setLicenseForm(prev => ({ ...prev, maxActivations: value }))} />
            <Field label="到期时间" type="datetime-local" value={licenseForm.expiresAt} onChange={value => setLicenseForm(prev => ({ ...prev, expiresAt: value }))} />
            <Field label="Product ID" value={licenseForm.productId} onChange={value => setLicenseForm(prev => ({ ...prev, productId: value }))} />
            <div className="md:col-span-2">
              <InfoPrimaryButton type="submit" disabled={submitting === 'license'}>
                <FaKey />
                {submitting === 'license' ? '提交中...' : '创建授权'}
              </InfoPrimaryButton>
            </div>
          </form>
          {createdLicense && (
            <div className={`${logShareTileClass} mt-5 p-4`}>
              <div className="flex flex-wrap items-center gap-2">
                <InfoBadge tone="emerald">新授权 {createdLicense.status}</InfoBadge>
                <InfoBadge tone="slate">{createdLicense.licenseId}</InfoBadge>
              </div>
              <div className="mt-3 break-all rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 font-mono text-sm text-slate-900">
                {createdLicense.licenseKey}
              </div>
              <p className="mt-2 text-xs leading-5 text-slate-500">返回后默认展示为 {createdLicense.key}。</p>
            </div>
          )}
        </SectionShell>

        <SectionShell title="修改或吊销授权" description="按授权 ID 修改状态、席位、客户归属或直接吊销授权并撤销激活。" icon={FaBan}>
          <form className="grid gap-4 md:grid-cols-2" onSubmit={updateLicense}>
            <Field label="License ID" value={licenseUpdateForm.licenseId} onChange={value => setLicenseUpdateForm(prev => ({ ...prev, licenseId: value }))} required />
            <SelectField label="状态" value={licenseUpdateForm.status} onChange={value => setLicenseUpdateForm(prev => ({ ...prev, status: value as LicenseStatus }))} options={statusOptions.map(value => ({ label: value, value }))} />
            <Field label="最大激活数" type="number" value={licenseUpdateForm.maxActivations} onChange={value => setLicenseUpdateForm(prev => ({ ...prev, maxActivations: value }))} />
            <Field label="到期时间" type="datetime-local" value={licenseUpdateForm.expiresAt} onChange={value => setLicenseUpdateForm(prev => ({ ...prev, expiresAt: value }))} />
            <Field label="Plan ID" value={licenseUpdateForm.planId} onChange={value => setLicenseUpdateForm(prev => ({ ...prev, planId: value }))} />
            <Field label="Customer ID" value={licenseUpdateForm.customerId} onChange={value => setLicenseUpdateForm(prev => ({ ...prev, customerId: value }))} />
            <div className="md:col-span-2">
              <InfoPrimaryButton type="submit" disabled={submitting === 'license-update'}>
                <FaRedo />
                {submitting === 'license-update' ? '提交中...' : '更新授权'}
              </InfoPrimaryButton>
            </div>
          </form>

          <form className="mt-6 flex flex-col gap-3 border-t border-slate-200 pt-5 sm:flex-row" onSubmit={revokeLicense}>
            <input
              className={inputClass}
              value={revokeLicenseId}
              onChange={event => setRevokeLicenseId(event.target.value)}
              placeholder="License ID"
              required
            />
            <button type="submit" className={logShareDangerButtonClass} disabled={submitting === 'license-revoke'}>
              <FaBan />
              {submitting === 'license-revoke' ? '吊销中...' : '吊销授权'}
            </button>
          </form>
        </SectionShell>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <SectionShell title="最近审计" description="展示 EcoEnchants 管理、授权校验和 Webhook 产生的审计记录。" icon={FaStream}>
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="text-xs uppercase tracking-[0.16em] text-slate-500">
                <tr>
                  <th className="px-3 py-2">时间</th>
                  <th className="px-3 py-2">动作</th>
                  <th className="px-3 py-2">操作者</th>
                  <th className="px-3 py-2">结果</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {auditLogs.map(log => (
                  <tr key={log.auditId}>
                    <td className="px-3 py-3 text-slate-500">{log.createdAt ? new Date(log.createdAt).toLocaleString() : '-'}</td>
                    <td className="px-3 py-3 font-medium text-slate-900">{log.action}</td>
                    <td className="px-3 py-3 text-slate-600">{log.actorType}:{log.actorId}</td>
                    <td className="px-3 py-3">
                      <InfoBadge tone={log.result === 'success' ? 'emerald' : 'rose'}>{log.result}</InfoBadge>
                    </td>
                  </tr>
                ))}
                {auditLogs.length === 0 && (
                  <tr><td className="px-3 py-8 text-center text-slate-500" colSpan={4}>暂无审计记录</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </SectionShell>

        <SectionShell title="风控事件" description="展示构建指纹不匹配、异常 Webhook 或后续风控流程产生的事件。" icon={FaExclamationTriangle}>
          <div className="space-y-3">
            {riskEvents.map(event => (
              <div key={event.riskEventId} className={`${logShareTileClass} p-4`}>
                <div className="flex flex-wrap items-center gap-2">
                  <InfoBadge tone={event.severity === 'high' ? 'rose' : 'slate'}>{event.severity}</InfoBadge>
                  <InfoBadge tone="slate">{event.status}</InfoBadge>
                  <span className="text-xs text-slate-500">{event.createdAt ? new Date(event.createdAt).toLocaleString() : '-'}</span>
                </div>
                <div className="mt-2 text-sm font-semibold text-slate-900">{event.type}</div>
                <p className="mt-1 text-sm leading-6 text-slate-600">{event.message}</p>
                {(event.licenseId || event.activationId) && (
                  <div className="mt-2 text-xs text-slate-500">
                    {event.licenseId && <span>License {event.licenseId}</span>}
                    {event.activationId && <span className="ml-3">Activation {event.activationId}</span>}
                  </div>
                )}
              </div>
            ))}
            {riskEvents.length === 0 && (
              <div className="rounded-2xl border border-dashed border-slate-200 py-8 text-center text-sm text-slate-500">
                暂无风控事件
              </div>
            )}
          </div>
        </SectionShell>
      </div>
        </>
      )}
    </div>
  );
};

export default EcoEnchantsAdminPage;
