
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

// 仅允许 http/https/blob/data:image 协议，避免不安全的 URL 被解释
const isSafeImageUrl = (url?: string) => {
  if (!url) return false;
  try {
    const u = new URL(url, window.location.origin);
    const protocol = u.protocol.toLowerCase();
    if (protocol === 'http:' || protocol === 'https:' || protocol === 'blob:') return true;
    // 允许 data:image/*
    if (protocol === 'data:') {
      return /^data:image\//i.test(url);
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
          <ImagePreview src={photoPreview || pendingPhoto || photoUrl} />
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
                onUrlChange(e.target.value);
                onPreviewChange(e.target.value);
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
