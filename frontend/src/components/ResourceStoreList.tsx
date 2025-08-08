import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { resourcesApi, Resource } from '../api/resources';
import { cdksApi } from '../api/cdks';
import { UnifiedLoadingSpinner } from './LoadingSpinner';

export default function ResourceStoreList() {
  const [resources, setResources] = useState<Resource[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [cdkCode, setCdkCode] = useState('');
  const [loading, setLoading] = useState(true);
  const [cdkLoading, setCdkLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    fetchResources();
    fetchCategories();
  }, [selectedCategory]);

  const fetchResources = async () => {
    try {
      const response = await resourcesApi.getResources(1, selectedCategory);
      setResources(response.resources);
    } catch (error) {
      setError('获取资源列表失败');
    } finally {
      setLoading(false);
    }
  };

  const fetchCategories = async () => {
    try {
      const response = await resourcesApi.getCategories();
      setCategories(response);
    } catch (error) {
      console.error('获取分类失败:', error);
    }
  };

  const handleRedeemCDK = async () => {
    if (!cdkCode.trim()) {
      setError('请输入CDK兑换码');
      return;
    }

    setCdkLoading(true);
    setError('');
    setSuccess('');

    try {
      const result = await cdksApi.redeemCDK(cdkCode);
      setSuccess(`兑换成功！获得资源：${result.resource.title}`);
      setCdkCode('');
      
      // 显示下载链接
      if (result.resource.downloadUrl) {
        setTimeout(() => {
          window.open(result.resource.downloadUrl, '_blank');
        }, 1000);
      }
    } catch (error) {
      setError('兑换失败：CDK无效或已使用');
    } finally {
      setCdkLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <UnifiedLoadingSpinner size="lg" text="加载资源商店..." />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900">资源商店</h1>
          <p className="mt-2 text-gray-600">探索和下载各种优质资源</p>
        </div>

        {/* CDK兑换区域 */}
        <div className="bg-white rounded-lg shadow p-6 mb-8">
          <h2 className="text-lg font-semibold mb-4">CDK兑换</h2>
          <div className="flex gap-4">
            <input
              type="text"
              placeholder="请输入CDK兑换码"
              className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
              value={cdkCode}
              onChange={(e) => setCdkCode(e.target.value)}
            />
            <button
              onClick={handleRedeemCDK}
              disabled={cdkLoading}
              className="px-6 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:opacity-50"
            >
              {cdkLoading ? '兑换中...' : '兑换'}
            </button>
          </div>
          {error && <p className="mt-2 text-red-600 text-sm">{error}</p>}
          {success && <p className="mt-2 text-green-600 text-sm">{success}</p>}
        </div>

        {/* 分类筛选 */}
        <div className="mb-6">
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setSelectedCategory('')}
              className={`px-4 py-2 rounded-full text-sm ${
                selectedCategory === '' 
                  ? 'bg-indigo-600 text-white' 
                  : 'bg-white text-gray-700 hover:bg-gray-50'
              }`}
            >
              全部
            </button>
            {categories.map((category) => (
              <button
                key={category}
                onClick={() => setSelectedCategory(category)}
                className={`px-4 py-2 rounded-full text-sm ${
                  selectedCategory === category 
                    ? 'bg-indigo-600 text-white' 
                    : 'bg-white text-gray-700 hover:bg-gray-50'
                }`}
              >
                {category}
              </button>
            ))}
          </div>
        </div>

        {/* 资源网格 */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {resources.map((resource) => (
            <div key={resource.id} className="bg-white rounded-lg shadow-md overflow-hidden hover:shadow-lg transition-shadow">
              <img
                src={resource.imageUrl || '/placeholder.jpg'}
                alt={resource.title}
                className="w-full h-48 object-cover"
              />
              <div className="p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-2">
                  {resource.title}
                </h3>
                <p className="text-gray-600 text-sm mb-4 line-clamp-2">
                  {resource.description}
                </p>
                <div className="flex items-center justify-between">
                  <div className="flex flex-col">
                    <span className="text-lg font-bold text-indigo-600">
                      ¥{resource.price}
                    </span>
                    <span className="text-xs text-gray-500">
                      {resource.category}
                    </span>
                  </div>
                  <Link
                    to={`/store/resources/${resource.id}`}
                    className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 text-sm"
                  >
                    查看详情
                  </Link>
                </div>
              </div>
            </div>
          ))}
        </div>

        {resources.length === 0 && (
          <div className="text-center py-12">
            <p className="text-gray-500">暂无资源</p>
          </div>
        )}
      </div>
    </div>
  );
} 