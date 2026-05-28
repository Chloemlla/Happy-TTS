import React from 'react';
import { motion } from 'framer-motion';
import {
  FaBarcode,
  FaCheckCircle,
  FaExclamationTriangle,
  FaExternalLinkAlt,
  FaFileAlt,
  FaInfoCircle,
  FaRulerCombined,
  FaTag,
} from 'react-icons/fa';
import { ProductInfo } from '../types/anta';
import { InfoBadge, InfoMetricCard, InfoPanel, InfoSectionTitle } from './InfoQueryScaffold';

interface ProductDetailsProps {
  product: ProductInfo & {
    brand?: string;
    category?: string;
    color?: string;
    material?: string;
  };
  queryCount: number;
  isVerified?: boolean;
}

const ProductDetails: React.FC<ProductDetailsProps> = ({ product, queryCount, isVerified = true }) => {
  const productFields = [
    { label: '条码', value: product.barcode, icon: FaBarcode },
    { label: '货号', value: product.itemNumber, icon: FaTag },
    { label: 'EAN 码', value: product.ean, icon: FaFileAlt },
    { label: '尺码', value: product.size, icon: FaRulerCombined },
    { label: '品名', value: product.productName || '未知', icon: FaInfoCircle },
    { label: '系列', value: product.series || product.category || '未知系列', icon: FaInfoCircle },
    { label: '性别', value: product.gender || '未知', icon: FaInfoCircle },
    { label: '零售价', value: product.retailPrice ? `¥${product.retailPrice.toFixed(2)}` : '未知', icon: FaTag },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22 }}
      className="space-y-6"
    >
      <InfoPanel className={isVerified ? 'border-emerald-100' : 'border-rose-100'}>
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex gap-4">
            <div className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-[24px] ring-1 ${isVerified ? 'bg-emerald-50 text-emerald-700 ring-emerald-100' : 'bg-rose-50 text-rose-700 ring-rose-100'}`}>
              {isVerified ? <FaCheckCircle className="h-6 w-6" /> : <FaExclamationTriangle className="h-6 w-6" />}
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">Verification Result</p>
              <h2 className="mt-2 text-2xl font-semibold text-slate-950">{isVerified ? '验证成功' : '验证失败'}</h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                {isVerified ? '该产品已返回安踏官方数据。' : '该产品验证失败，请谨慎购买并联系官方渠道。'}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <InfoBadge tone={isVerified ? 'emerald' : 'rose'}>{isVerified ? '正品验证' : '认证未通过'}</InfoBadge>
            <InfoBadge tone={queryCount > 1 ? 'amber' : 'sky'}>查询次数 {queryCount}</InfoBadge>
          </div>
        </div>
      </InfoPanel>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <InfoMetricCard label="产品名称" value={product.productName || '未知'} detail={product.series || '暂无系列信息'} icon={FaInfoCircle} tone="emerald" />
        <InfoMetricCard label="查询次数" value={queryCount} detail="由后端统计服务返回" icon={queryCount > 1 ? FaExclamationTriangle : FaCheckCircle} tone={queryCount > 1 ? 'amber' : 'sky'} />
        <InfoMetricCard label="查询时间" value={new Date().toLocaleTimeString('zh-CN')} detail={new Date().toLocaleDateString('zh-CN')} icon={FaFileAlt} tone="slate" />
      </div>

      <InfoPanel>
        <InfoSectionTitle
          title="产品详情"
          description="以下字段来自查询响应，缺失字段会显示为未知。"
          icon={FaFileAlt}
          tone="emerald"
        />
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {productFields.map((field) => {
            const Icon = field.icon;
            return (
              <div key={field.label} className="rounded-[22px] border border-slate-200 bg-white/80 p-4">
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[18px] bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100">
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <dt className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">{field.label}</dt>
                    <dd className="mt-1 break-all text-base font-semibold text-slate-900">{field.value}</dd>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </InfoPanel>

      {queryCount > 1 && (
        <InfoPanel compact className="border-amber-200 bg-amber-50/80">
          <div className="flex items-start gap-3 text-amber-800">
            <FaExclamationTriangle className="mt-1 shrink-0" />
            <div>
              <h3 className="font-semibold">高频查询提醒</h3>
              <p className="mt-1 text-sm leading-6">
                该产品查询次数较多，可能存在二次流通或假冒风险。建议通过安踏官方渠道购买，或前往官方授权店铺进一步验证。
              </p>
            </div>
          </div>
        </InfoPanel>
      )}

      <InfoPanel compact>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-sm leading-6 text-slate-600">
            本查询结果仅供参考，产品真伪最终解释权归安踏体育用品有限公司所有。
          </div>
          <div className="flex flex-wrap gap-2">
            <a
              href="https://www.anta.com"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-800"
            >
              安踏官网 <FaExternalLinkAlt className="h-3.5 w-3.5" />
            </a>
            <a
              href="/policy"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              隐私条款
            </a>
          </div>
        </div>
      </InfoPanel>
    </motion.div>
  );
};

export default ProductDetails;
