
import React, { useRef, useState, ChangeEvent } from 'react';
import { FaUpload, FaUser } from 'react-icons/fa';

interface ImageUploadSectionProps {
  photoPreview: string;
  pendingPhoto: string;
  photoUrl: string;
  loading: boolean;
  onImageUpload: (e: ChangeEvent<HTMLInputElement>) => void;
  onUrlChange: (url: string) => void;
  onPreviewChange: (url: string) => void;
}

// 规范化用户输入的图片 URL：
// - 去除首尾空格
// - 支持以 // 开头的协议相对 URL（视为 https）
// - 对于无协议且像域名/路径的，默认补全为 https://
const sanitizeImageUrl = (raw?: string) => {
  const input = (raw || '').trim();
  if (!input) return '';
  if (input.startsWith('data:image/')) return input; // 直接允许 data:image/*
  if (input.startsWith('blob:')) return input;
  if (input.startsWith('//')) return `https:${input}`;
  // 粗略判断是否缺少协议：不含 '://' 且不以 'data:'/'blob:' 开头
  if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(input)) {
    return `https://${input}`;
  }
  return input;
};

// 仅允许 http/https/blob/data:image(raster) 协议，避免不安全的 URL 被解释
const isSafeImageUrl = (url?: string) => {
  const candidate = sanitizeImageUrl(url);
  if (!candidate) return false;
  try {
    const u = new URL(candidate, window.location.origin);
    const protocol = u.protocol.toLowerCase();
    if (protocol === 'http:' || protocol === 'https:' || protocol === 'blob:') return true;
    // 仅允许 data:image 的常见位图类型，拒绝 svg+xml 等可能被误解释为可执行内容的类型
    if (protocol === 'data:') {
      return /^data:image\/(png|jpe?g|webp|gif|bmp);/i.test(candidate);
    }
    return false;
  } catch {
    return false;
  }
};

// 图片预览组件
const ImagePreview: React.FC<{ src?: string; alt?: string }> = ({ src, alt = '通缉犯照片' }) => {
  const [error, setError] = useState(false);
  const safeSrc = isSafeImageUrl(src) ? src : undefined;

  if (!safeSrc || error) {
    return (
      <div className="w-full h-48 bg-gray-100 rounded-lg flex items-center justify-center">
        <FaUser className="text-4xl text-gray-400" />
      </div>
    );
  }

  return (
    <img
      src={safeSrc}
      alt={alt}
      className="w-full h-48 object-cover rounded-lg"
      onError={() => setError(true)}
    />
  );
};

const ImageUploadSection: React.FC<ImageUploadSectionProps> = ({
  photoPreview,
  pendingPhoto,
  photoUrl,
  loading,
  onImageUpload,
  onUrlChange,
  onPreviewChange
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-2">通缉犯照片</label>
      <div className="space-y-4">
        {/* 图片预览 */}
        <div className="w-full">
          <ImagePreview src={sanitizeImageUrl(photoPreview || pendingPhoto || photoUrl)} />
        </div>

        {/* 上传按钮和URL输入 */}
        <div className="flex flex-col sm:flex-row gap-3">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={onImageUpload}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors disabled:opacity-50"
          >
            <FaUpload />
            {loading ? '上传中...' : '上传图片'}
          </button>

          {/* 手动输入URL */}
          <div className="flex-1">
            <input
              type="url"
              value={photoUrl || ''}
              onChange={(e) => {
                const normalized = sanitizeImageUrl(e.target.value);
                onUrlChange(normalized);
                onPreviewChange(normalized);
              }}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="或输入图片URL"
            />
          </div>
        </div>

        <p className="text-sm text-gray-500">
          支持 JPEG, PNG, WebP, GIF 格式，最大 5MB
        </p>
      </div>
    </div>
  );
};

export default ImageUploadSection;
