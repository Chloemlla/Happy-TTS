import { m } from 'framer-motion';
import { FaSync } from 'react-icons/fa';
import CollapsibleSection from './CollapsibleSection';
import type { IPFSConfigSetting } from './types';

const REFRESH_BUTTON_CLASS =
  'inline-flex items-center gap-2 rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60';

export interface IpfsConfigSectionProps {
  isOpen: boolean;
  onToggle: (key: string) => void;
  prefersReducedMotion: boolean | null | undefined;
  loading: boolean;
  saving: boolean;
  testing: boolean;
  ipfsConfig: IPFSConfigSetting | null;
  ipfsUploadUrlInput: string;
  ipfsUserAgentInput: string;
  imageBedApiUrlInput: string;
  imageBedCdnDomainInput: string;
  imageBedStorageDestinationInput: string;
  imageBedOutputFormatInput: string;
  onIpfsUploadUrlChange: (value: string) => void;
  onIpfsUserAgentChange: (value: string) => void;
  onImageBedApiUrlChange: (value: string) => void;
  onImageBedCdnDomainChange: (value: string) => void;
  onImageBedStorageDestinationChange: (value: string) => void;
  onImageBedOutputFormatChange: (value: string) => void;
  onRefresh: () => void;
  onSave: () => void;
  onTest: (target: 'imagebed' | 'ipfs') => void;
}

export default function IpfsConfigSection({
  isOpen,
  onToggle,
  prefersReducedMotion,
  loading,
  saving,
  testing,
  ipfsConfig,
  ipfsUploadUrlInput,
  ipfsUserAgentInput,
  imageBedApiUrlInput,
  imageBedCdnDomainInput,
  imageBedStorageDestinationInput,
  imageBedOutputFormatInput,
  onIpfsUploadUrlChange,
  onIpfsUserAgentChange,
  onImageBedApiUrlChange,
  onImageBedCdnDomainChange,
  onImageBedStorageDestinationChange,
  onImageBedOutputFormatChange,
  onRefresh,
  onSave,
  onTest
}: IpfsConfigSectionProps) {
  return (
    <CollapsibleSection title="IPFS 配置设置" description="管理 IPFS 上传、User-Agent 和图片床默认参数。" sectionKey="ipfs" isOpen={isOpen} onToggle={onToggle} prefersReducedMotion={prefersReducedMotion} headerRight={
              <m.button onClick={(e) => { e.stopPropagation(); onRefresh(); }} disabled={loading} className={REFRESH_BUTTON_CLASS} whileTap={{ scale: 0.95 }}>
                <FaSync className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> 刷新
              </m.button>
            }>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">IPFS上传URL</label>
                  <input
                    value={ipfsUploadUrlInput}
                    onChange={(e) => onIpfsUploadUrlChange(e.target.value)}
                    placeholder="例如：https://ipfs.openai.com/api/v0/add"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400 text-sm sm:text-base"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">当前配置</label>
                  <div className="px-3 py-2 border border-gray-200 rounded-lg bg-gray-50 text-sm text-gray-700 min-h-[40px] flex items-center break-all">
                    {loading ? '加载中...' : (ipfsConfig?.ipfsUploadUrl || '未设置')}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">IPFS User-Agent</label>
                  <input
                    value={ipfsUserAgentInput}
                    onChange={(e) => onIpfsUserAgentChange(e.target.value)}
                    placeholder="例如：Synapse-IPFS-Uploader/1.0 (+https://example.com)"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400 text-sm sm:text-base"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">当前User-Agent</label>
                  <div className="px-3 py-2 border border-gray-200 rounded-lg bg-gray-50 text-sm text-gray-700 min-h-[40px] flex items-center break-all">
                    {loading ? '加载中...' : (ipfsConfig?.ipfsUa || '未设置')}
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-end gap-3">
                <m.button
                  onClick={() => onTest('imagebed')}
                  disabled={testing}
                  className="px-3 sm:px-4 py-2 bg-emerald-500 text-white rounded-lg hover:bg-emerald-600 transition disabled:opacity-50 text-sm font-medium"
                  whileTap={{ scale: 0.96 }}
                >
                  {testing ? '测试中...' : '测试 ImageBed'}
                </m.button>
                <m.button
                  onClick={() => onTest('ipfs')}
                  disabled={testing || !ipfsConfig?.ipfsUploadUrl}
                  className="px-3 sm:px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition disabled:opacity-50 text-sm font-medium"
                  whileTap={{ scale: 0.96 }}
                >
                  {testing ? '测试中...' : '测试 IPFS'}
                </m.button>
                <m.button
                  onClick={onSave}
                  disabled={saving}
                  className="px-3 sm:px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition disabled:opacity-50 text-sm font-medium"
                  whileTap={{ scale: 0.96 }}
                >
                  {saving ? '保存中...' : '保存/更新'}
                </m.button>
              </div>

              {/* ImageBed (scdn.io v1.php) 配置 */}
              <div className="mt-6 border-t border-gray-200 pt-4">
                <h4 className="text-md font-semibold text-gray-700 mb-3">ImageBed (scdn.io v1.php) 默认配置</h4>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">ImageBed API URL</label>
                    <input
                      value={imageBedApiUrlInput}
                      onChange={(e) => onImageBedApiUrlChange(e.target.value)}
                      placeholder="默认：https://img.scdn.io/api/v1.php"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400 text-sm sm:text-base"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">当前 API</label>
                    <div className="px-3 py-2 border border-gray-200 rounded-lg bg-gray-50 text-sm text-gray-700 min-h-[40px] flex items-center break-all">
                      {loading ? '加载中...' : (ipfsConfig?.imageBedApiUrl || '未设置')}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">默认 CDN 域名</label>
                    <input
                      value={imageBedCdnDomainInput}
                      onChange={(e) => onImageBedCdnDomainChange(e.target.value)}
                      placeholder="例如：img.scdn.io"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400 text-sm sm:text-base"
                    />
                    <div className="mt-1 text-xs text-gray-500 break-all">当前：{ipfsConfig?.imageBedCdnDomain || '未设置'}</div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">默认存储位置</label>
                    <select
                      value={imageBedStorageDestinationInput}
                      onChange={(e) => onImageBedStorageDestinationChange(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400 text-sm sm:text-base bg-white"
                    >
                      <option value="">不变更</option>
                      <option value="local">local（默认）</option>
                      <option value="telegram">telegram</option>
                      <option value="r2">r2（Cloudflare R2）</option>
                    </select>
                    <div className="mt-1 text-xs text-gray-500">当前：{ipfsConfig?.imageBedStorageDestination || '未设置'}</div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">默认输出格式</label>
                    <select
                      value={imageBedOutputFormatInput}
                      onChange={(e) => onImageBedOutputFormatChange(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400 text-sm sm:text-base bg-white"
                    >
                      <option value="">不变更</option>
                      <option value="auto">auto（自动）</option>
                      <option value="webp">webp</option>
                      <option value="webp_animated">webp_animated</option>
                      <option value="jpg">jpg</option>
                      <option value="jpeg">jpeg</option>
                      <option value="png">png</option>
                      <option value="gif">gif</option>
                    </select>
                    <div className="mt-1 text-xs text-gray-500">当前：{ipfsConfig?.imageBedOutputFormat || '未设置'}</div>
                  </div>
                </div>
              </div>

              <div className="mt-4 text-xs text-gray-500">
                说明：图片类上传（jpg/png/webp/gif/bmp/tiff）走 ImageBed (scdn.io v1.php) API；SVG 与归档等非图片文件仍走旧 IPFS。可在此设置 ImageBed 默认 API、CDN、存储位置与输出格式。
              </div>
            </CollapsibleSection>
  );
}
