import React from 'react';
import {
  FaDatabase,
  FaExclamationTriangle,
  FaKey,
  FaListUl,
  FaShieldAlt,
  FaSlidersH,
} from 'react-icons/fa';
import type { ProxycheckCollectionInfo, ProxycheckOverviewResponse } from '@/api/ipRiskLogs';
import { InfoBadge, InfoMetricCard, InfoPanel, InfoSectionTitle } from '@/components/InfoQueryScaffold';
import { cn } from '@/lib/utils';
import { formatCount, formatRelativeTime, formatTime, shortText, switchBadge } from './format';
import {
  Badge,
  BoolField,
  DataPanel,
  FieldGrid,
  FieldRow,
  JsonBlock,
  KeyField,
  NumberField,
  SectionNote,
  TableWrap,
  Td,
  Th,
} from './ui';

interface Props {
  overview: ProxycheckOverviewResponse | null;
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
}

const TTL_INDEX_PATTERN = /expireafterseconds/i;

const collectionHasTtl = (collection: ProxycheckCollectionInfo): boolean =>
  (collection.indexes ?? []).some((index) => TTL_INDEX_PATTERN.test(index));

const OverviewTab: React.FC<Props> = ({ overview, loading, error, onRefresh }) => {
  if (loading && !overview) {
    return (
      <DataPanel>
        <div className="p-8 text-center text-slate-400">正在读取 proxycheck 概览……</div>
      </DataPanel>
    );
  }

  if (error && !overview) {
    return (
      <DataPanel>
        <div className="space-y-3 p-8 text-center">
          <div className="text-rose-600">{error}</div>
          <button type="button" onClick={onRefresh} className="text-xs font-semibold text-indigo-600 underline">
            重试
          </button>
        </div>
      </DataPanel>
    );
  }

  if (!overview) {
    return (
      <DataPanel>
        <div className="p-8 text-center text-slate-400">暂无概览数据</div>
      </DataPanel>
    );
  }

  const { setting, counts, quota, quotaHistory, collections } = overview;
  const config = setting?.config;
  const quotaLimit = quota?.limit ?? config?.dailyQuotaPerKey ?? 0;
  const quotaRatio = quotaLimit > 0 ? Math.min(1, (quota?.count ?? 0) / quotaLimit) : 0;

  const collectionDocs: Record<string, { value: string; hint: string }> = {
    proxycheck_lookup_logs: {
      value: formatCount(counts?.lookupLogs),
      hint: `其中最近 24 小时 ${formatCount(counts?.lookupLogs24h)} 条`,
    },
    proxycheck_risk_cache: {
      value: formatCount(counts?.riskCache),
      hint: `其中生效中（expiresAt > now）${formatCount(counts?.riskCacheActive)} 条`,
    },
    proxycheck_probe_reports: {
      value: formatCount(counts?.probeReports),
      hint: `其中最近 24 小时 ${formatCount(counts?.probeReports24h)} 条`,
    },
    proxycheck_daily_quotas: {
      value: '见「每日配额」页',
      hint: `本端点只在 quotaHistory 回传最近 ${quotaHistory?.length ?? 0} 天的行；集合本身按 {dayKey, apiKeySlot} 唯一`,
    },
  };

  if (!config) {
    return (
      <DataPanel>
        <div className="space-y-3 p-8 text-center">
          <div className="text-slate-500">概览没有回传配置（setting.config），无法渲染配置现状。</div>
          <JsonBlock value={overview} />
        </div>
      </DataPanel>
    );
  }

  return (
    <div className="space-y-6">
      <SectionNote>
        数据来源：<code>GET /api/admin/proxycheck/overview</code>。它会现读配置（<code>RuntimeConfigService.getProxycheckSetting()</code>，密钥已 mask）、
        现数四个集合的文档量与索引，并回传当前配额与最近 30 天配额历史。命中缓存的查询不写任何日志（零上游、零写入），
        所以不会出现在「API 请求日志」页，也不计入这里的 24 小时计数。
      </SectionNote>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <InfoMetricCard
          label="上游请求日志"
          value={formatCount(counts?.lookupLogs)}
          detail={`24 小时内 ${formatCount(counts?.lookupLogs24h)} 条`}
          icon={FaListUl}
          tone="sky"
        />
        <InfoMetricCard
          label="风险缓存"
          value={formatCount(counts?.riskCache)}
          detail={`生效中 ${formatCount(counts?.riskCacheActive)} 条`}
          icon={FaDatabase}
          tone="teal"
        />
        <InfoMetricCard
          label="探测上报"
          value={formatCount(counts?.probeReports)}
          detail={`24 小时内 ${formatCount(counts?.probeReports24h)} 条`}
          icon={FaShieldAlt}
          tone="violet"
        />
      </div>

      <InfoPanel>
        <InfoSectionTitle
          title="配置现状"
          description="写入点：运行时配置 PROXYCHECK 文档（未存过则回落 env 种子值）。所有密钥都已经过服务端 mask，本页不做二次处理，也拿不到明文。"
          icon={FaSlidersH}
          eyebrow="§1 配置"
          action={<Badge style={switchBadge(config.enabled)} />}
        />

        <div className="space-y-4">
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">四把密钥</p>
            <div className="grid grid-cols-1 gap-x-6 gap-y-1.5 text-xs lg:grid-cols-2">
              <KeyField
                label="apiKey（服务端 key）"
                has={config.hasApiKey}
                masked={config.apiKey}
                hint="4 段式服务端密钥，绝不下发到浏览器；上游查询用它。"
              />
              <KeyField
                label="publicApiKey（浏览器/CORS key）"
                has={config.hasPublicApiKey}
                masked={config.publicApiKey}
                hint="形如 public-######-######-######，仅在 usePublicKeyForClient 打开时下发给前端做直连查询。"
              />
              <KeyField
                label="payloadVerificationKey（上游响应验签）"
                has={config.hasPayloadVerificationKey}
                masked={config.payloadVerificationKey}
                hint="proxycheck 官方 Dashboard 的 API Payload Verification Key（64 字符），用来校验上游响应的 http_x_signature 头；空串 = 不验签，只依赖 TLS。"
              />
              <KeyField
                label="hmacSecret（自建主密钥）"
                has={config.hasHmacSecret}
                masked={config.hmacSecret}
                hint="本服务自建，用来签发/校验浏览器上报的出口探测遥测。与上面的 payloadVerificationKey 用途相反，别混。"
              />
            </div>
          </div>

          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">行为参数</p>
            <FieldGrid className="lg:grid-cols-3">
              <NumberField label="cacheTtlHours" value={config.cacheTtlHours} hint="同 IP 去重 TTL 小时数，决定 proxycheck_risk_cache 的 expiresAt。" />
              <NumberField label="timeoutMs" value={config.timeoutMs} hint="单次上游请求超时；超时归入 source=unavailable。" />
              <NumberField label="dailyQuotaPerKey" value={config.dailyQuotaPerKey} hint="每把 key 的每日查询额度，配额用尽后不再外呼。" />
              <NumberField
                label="challengeRiskScore"
                value={config.challengeRiskScore}
                hint="风险分 ≥ 该值即要求挑战（0..100）。注意本页显示的是「当前」值，历史日志里的阈值看各行的 decision.threshold。"
              />
              <BoolField label="failOpen" value={config.failOpen} hint="上游失败是否放行。proxycheck 是辅助信号而非唯一闸门，默认放行。" />
              <BoolField
                label="usePublicKeyForClient"
                value={config.usePublicKeyForClient}
                hint="是否把 publicApiKey 下发给前端做直连查询。"
              />
              <BoolField label="enabled" value={config.enabled} hint="总开关；未配置 key 前不得外呼。" />
              <FieldRow
                label="updatedAt"
                value={setting.updatedAt ? `${formatTime(setting.updatedAt)}（${formatRelativeTime(setting.updatedAt)}）` : '未存过，正在用 env 种子值'}
                always
              />
            </FieldGrid>
          </div>
        </div>
      </InfoPanel>

      <InfoPanel>
        <InfoSectionTitle
          title="每日配额现状"
          description="写入点：src/services/ipRiskService.ts 的配额结算，按 {dayKey, apiKeySlot} 唯一。每次真正打到上游才 +1，命中缓存不消耗配额。"
          icon={FaKey}
          eyebrow="§5 配额"
        />

        <div className="rounded-2xl border border-slate-200 bg-white/70 p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <div className="text-sm font-semibold text-slate-800">
              {quota?.dayKey ?? '-'} · apiKeySlot {quota?.apiKeySlot ?? '-'}
            </div>
            <div className="text-xs text-slate-500">
              {formatCount(quota?.count)} / {formatCount(quotaLimit)}
              {quota?.exhausted ? <span className="ml-2 font-semibold text-rose-600">已用尽</span> : null}
            </div>
          </div>
          <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-100">
            <div
              className={cn('h-full rounded-full', quota?.exhausted ? 'bg-rose-500' : 'bg-emerald-500')}
              style={{ width: `${Math.round(quotaRatio * 100)}%` }}
            />
          </div>
          <FieldGrid className="mt-3">
            <FieldRow label="exhaustedAt" value={formatTime(quota?.exhaustedAt)} always />
            <FieldRow label="lastUsedAt" value={formatTime(quota?.lastUsedAt)} always />
          </FieldGrid>
        </div>

        {quotaHistory && quotaHistory.length > 0 ? (
          <div className="mt-4">
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
              最近 {quotaHistory.length} 天配额历史（按 dayKey 倒序）
            </p>
            <TableWrap minWidth="min-w-[760px]">
              <thead>
                <tr className="border-b border-slate-200">
                  <Th>dayKey</Th>
                  <Th>count</Th>
                  <Th>是否用尽</Th>
                  <Th>exhaustedAt</Th>
                  <Th>lastUsedAt</Th>
                  <Th>apiKeyHash</Th>
                </tr>
              </thead>
              <tbody>
                {quotaHistory.map((row) => (
                  <tr key={`${row.dayKey}-${row.apiKeySlot ?? 0}`} className="border-b border-slate-100">
                    <Td className="font-mono text-slate-700">{row.dayKey}</Td>
                    <Td className="text-slate-700">{formatCount(row.count)}</Td>
                    <Td>
                      {row.exhausted ? (
                        <span className="font-semibold text-rose-600">已用尽</span>
                      ) : (
                        <span className="text-slate-500">未用尽</span>
                      )}
                    </Td>
                    <Td className="whitespace-nowrap text-slate-500">{formatTime(row.exhaustedAt)}</Td>
                    <Td className="whitespace-nowrap text-slate-500">{formatTime(row.lastUsedAt)}</Td>
                    <Td className="font-mono text-[11px] text-slate-500">
                      <span title={row.apiKeyHash}>{shortText(row.apiKeyHash, 14)}</span>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </TableWrap>
          </div>
        ) : (
          <p className="mt-4 text-xs text-slate-400">最近 30 天没有任何配额记录（说明一次都没真正打到上游）。</p>
        )}
      </InfoPanel>

      <InfoPanel>
        <InfoSectionTitle
          title="集合现状"
          description="索引来自各集合的 listIndexes()。只有带 expireAfterSeconds 的索引才是 TTL 索引 —— 没有 TTL 的集合不会自动清理，会一直涨。"
          icon={FaDatabase}
          eyebrow="§2 集合"
        />
        <div className="space-y-3">
          {(collections ?? []).map((collection) => {
            const meta = collectionDocs[collection.name];
            const hasTtl = collectionHasTtl(collection);
            return (
              <div key={collection.name} className="rounded-2xl border border-slate-200 bg-white/70 p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-sm font-semibold text-slate-800">{collection.name}</span>
                  {collection.exists === false ? (
                    <InfoBadge tone="slate">集合尚不存在</InfoBadge>
                  ) : null}
                  {hasTtl ? (
                    <InfoBadge tone="emerald">有 TTL 索引（自动清理）</InfoBadge>
                  ) : (
                    <InfoBadge tone="amber">无 TTL = 不会自动清理</InfoBadge>
                  )}
                </div>
                <div className="mt-2 text-xs text-slate-600">
                  文档数：{meta ? meta.value : '未在本端点统计内'}
                  {meta ? <span className="text-slate-400">（{meta.hint}）</span> : null}
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <span className="text-xs text-slate-500">索引：</span>
                  {(collection.indexes ?? []).length === 0 ? (
                    <span className="text-xs text-slate-400">（除 _id 外没有任何二级索引）</span>
                  ) : (
                    collection.indexes.map((index) => (
                      <span
                        key={index}
                        className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-0.5 font-mono text-[11px] text-slate-600"
                      >
                        {index}
                      </span>
                    ))
                  )}
                </div>
              </div>
            );
          })}
          {(collections ?? []).length === 0 ? (
            <p className="text-xs text-slate-400">本端点没有回传集合信息。</p>
          ) : null}
        </div>
        <p className="mt-4 flex items-start gap-1.5 text-xs leading-5 text-slate-500">
          <FaExclamationTriangle className="mt-0.5 shrink-0 text-amber-500" />
          <span>
            只有 <code>proxycheck_risk_cache</code> 声明了带 <code>expiresAfterSeconds</code> 的 TTL 索引，到期由 MongoDB 自动回收；
            <code>proxycheck_lookup_logs</code> 与 <code>proxycheck_probe_reports</code> 原本是纯只写集合、无二级索引，
            本面板上线时为按时间倒序翻页各补了一条 <code>{'{ createdAt: -1 }'}</code> 索引 —— 但两者都没有 TTL，
            保留期由 owner 决定，目前不会自动清理。
          </span>
        </p>
      </InfoPanel>

      <InfoPanel>
        <InfoSectionTitle
          title="原始响应"
          description="GET /api/admin/proxycheck/overview 的完整 JSON，密钥字段是服务端 mask 后的值。"
          icon={FaListUl}
          eyebrow="原始 JSON"
        />
        <JsonBlock value={overview} />
      </InfoPanel>
    </div>
  );
};

export default OverviewTab;
