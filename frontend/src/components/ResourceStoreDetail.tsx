import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { FaArrowLeft, FaInfoCircle, FaTag } from 'react-icons/fa';
import { resourcesApi, Resource } from '../api/resources';
import { UnifiedLoadingSpinner } from './LoadingSpinner';
import { cn } from '../utils/cn';
import {
  studioAccentBlobBlueClassName,
  studioAccentBlobSkyClassName,
  studioEyebrowPillClassName,
  studioGhostButtonClassName,
  studioHeroCardClassName,
  studioPageClassName,
  studioPageFont,
} from './studioTheme';

export default function ResourceStoreDetail() {
  const { id } = useParams<{ id: string }>();
  const [resource, setResource] = useState<Resource | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (id) {
      fetchResource(id);
    }
  }, [id]);

  const fetchResource = async (resourceId: string) => {
    try {
      const response = await resourcesApi.getResource(resourceId);
      setResource(response);
    } catch (error) {
      setError('获取资源详情失败');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className={studioPageClassName} style={{ fontFamily: studioPageFont }}>
        <div className="flex min-h-[46vh] items-center justify-center">
          <UnifiedLoadingSpinner size="lg" text="加载资源详情..." />
        </div>
      </div>
    );
  }

  if (error || !resource) {
    return (
      <div className={studioPageClassName} style={{ fontFamily: studioPageFont }}>
        <div className="mx-auto max-w-2xl">
          <div className={cn(studioHeroCardClassName, 'text-center')}>
            <div className={cn(studioEyebrowPillClassName, 'mx-auto w-fit')}>Resource Store</div>
            <h1 className="mt-5 text-3xl font-semibold leading-tight text-slate-900">资源不可用</h1>
            <p className="mt-4 text-sm leading-7 text-slate-600">{error || '资源不存在'}</p>
            <div className="mt-7">
              <Link to="/store" className={studioGhostButtonClassName}>
                <FaArrowLeft className="text-[10px]" />
                返回商店
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <section className={cn(studioPageClassName, 'max-w-5xl')} style={{ fontFamily: studioPageFont }}>
      <div className="mb-6">
        <Link to="/store" className={studioGhostButtonClassName}>
          <FaArrowLeft className="text-[10px]" />
          返回商店
        </Link>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className={studioHeroCardClassName}
      >
        <div className={cn(studioAccentBlobBlueClassName, '-right-12 top-0')} aria-hidden />
        <div className={cn(studioAccentBlobSkyClassName, '-left-10 bottom-0')} aria-hidden />

        <div className="relative grid gap-8 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start">
          <div className="min-w-0">
            <div className="relative overflow-hidden rounded-[26px] border border-slate-200 bg-slate-100 shadow-sm">
              <img
                src={resource.imageUrl || '/placeholder.jpg'}
                alt={resource.title}
                className="aspect-[16/10] w-full object-cover"
              />
              <span className="absolute left-4 top-4 inline-flex items-center gap-2 rounded-full border border-white/70 bg-white/90 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-600 backdrop-blur-xl">
                <FaTag className="text-[10px]" />
                {resource.category}
              </span>
            </div>
          </div>

          <div className="min-w-0">
            <div className={studioEyebrowPillClassName}>
              Resource Detail
            </div>
            <h1 className="mt-5 break-words text-3xl font-semibold leading-tight text-slate-900 sm:text-4xl">
              {resource.title}
            </h1>
            <p className="mt-4 text-sm leading-7 text-slate-600 sm:text-base">
              {resource.description}
            </p>

            <div className="mt-7 rounded-[22px] border border-slate-200 bg-slate-50/80 px-5 py-4">
              <div className="text-[11px] font-semibold uppercase tracking-[0.26em] text-slate-500">
                Price
              </div>
              <div className="mt-2 text-3xl font-semibold text-slate-900">
                ¥{resource.price}
              </div>
            </div>

            <div className="mt-5 rounded-[22px] border border-amber-200/70 bg-amber-50/80 px-5 py-4">
              <div className="flex items-start gap-3">
                <FaInfoCircle className="mt-1 shrink-0 text-amber-600" />
                <div>
                  <h2 className="text-sm font-semibold text-amber-800">获取方式</h2>
                  <p className="mt-1 text-sm leading-6 text-amber-700">
                    使用 CDK 兑换码获取此资源的下载链接。
                  </p>
                </div>
              </div>
            </div>

            <div className="mt-5 grid gap-2 rounded-[22px] border border-slate-200 bg-white/80 px-5 py-4 text-xs leading-6 text-slate-500">
              <p>创建时间: {new Date(resource.createdAt).toLocaleDateString()}</p>
              <p>更新时间: {new Date(resource.updatedAt).toLocaleDateString()}</p>
            </div>
          </div>
        </div>
      </motion.div>
    </section>
  );
}
